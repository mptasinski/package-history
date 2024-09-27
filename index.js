#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const glob = require('glob');
const { Command } = require('commander');
const fs = require('fs');
const path = require('path');

const program = new Command();

program
    .requiredOption('-f, --files <pattern>', 'Glob pattern to specify target files, e.g., "**/package.json"')
    .requiredOption('-k, --keyword <word>', 'Keyword to search for within the files, e.g., "lodash"')
    .option('-c, --csv <file>', 'Path to save the output as a CSV file')
    .option('-j, --json <file>', 'Path to save the output as a JSON file')
    .option('-d, --dedupe', 'Enable deduplication to record only unique changes per file', false);

program.parse(process.argv);

const options = program.opts();
const { files: filePattern, keyword, csv: csvOutput, json: jsonOutput, dedupe } = options;

/**
 * Fetches all commits that modified files matching the file pattern.
 * Commits are ordered from oldest to newest to facilitate deduplication.
 * @param {string} filePattern - Glob pattern for target files.
 * @returns {Promise<Array<{hash: string, date: string}>>}
 */
async function getCommits(filePattern) {
    try {
        // Use git log to get commits that modified files matching the pattern
        // The --reverse flag lists commits from oldest to newest
        const cmd = `git log --reverse --pretty=format:"%H|%ad" --date=iso -- ${filePattern}`;
        const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 10 }); // Increase buffer for large outputs
        const commits = stdout
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(line => {
                const [hash, ...dateParts] = line.split('|');
                const date = dateParts.join('|').trim();
                return { hash, date };
            });
        return commits;
    } catch (error) {
        console.error('Error fetching commits:', error.stderr || error.message);
        process.exit(1);
    }
}

/**
 * Fetches files modified in a specific commit that match the file pattern.
 * @param {string} commitHash - Commit hash.
 * @param {string} filePattern - Glob pattern for target files.
 * @returns {Promise<Array<string>>}
 */
async function getFilesInCommit(commitHash, filePattern) {
    try {
        const cmd = `git diff-tree --no-commit-id --name-only -r ${commitHash}`;
        const { stdout } = await execAsync(cmd);
        const allFiles = stdout.split('\n').filter(file => file.trim() !== '');
        const matchedFiles = allFiles.filter(file => {
            // Check if the file matches the glob pattern
            return glob.sync(filePattern, { cwd: process.cwd(), matchBase: true }).includes(file);
        });
        return matchedFiles;
    } catch (error) {
        console.error(`Error fetching files for commit ${commitHash}:`, error.stderr || error.message);
        return [];
    }
}

/**
 * Retrieves lines containing the keyword from a file at a specific commit.
 * @param {string} commitHash - Commit hash.
 * @param {string} filePath - Path to the file.
 * @param {string} keyword - Keyword to search for.
 * @returns {Promise<Array<string>>}
 */
async function getKeywordLines(commitHash, filePath, keyword) {
    try {
        const cmd = `git show ${commitHash}:${filePath}`;
        const { stdout } = await execAsync(cmd);
        return stdout.split('\n').filter(line => line.includes(keyword));
    } catch (error) {
        // File might not exist in this commit or other errors
        return [];
    }
}

/**
 * Processes all commits to find keyword occurrences.
 * When dedupe is enabled, only unique changes (i.e., when the keyword line changes) are recorded.
 * @param {Array<{hash: string, date: string}>} commits - List of commits.
 * @param {string} filePattern - Glob pattern for target files.
 * @param {string} keyword - Keyword to search for.
 * @param {boolean} dedupe - Whether to enable deduplication.
 * @returns {Promise<Array<{filename: string, date: string, line: string}>>}
 */
async function processCommits(commits, filePattern, keyword, dedupe) {
    const results = [];
    const lastRecordedLinePerFile = new Map(); // Tracks the last recorded line per file

    for (const [index, commit] of commits.entries()) {
        console.log(`Processing commit ${index + 1}/${commits.length}: ${commit.hash}`);

        const files = await getFilesInCommit(commit.hash, filePattern);

        for (const file of files) {
            const lines = await getKeywordLines(commit.hash, file, keyword);
            if (lines.length > 0) {
                lines.forEach(line => {
                    const trimmedLine = line.trim();
                    if (dedupe) {
                        const lastLine = lastRecordedLinePerFile.get(file);
                        if (lastLine === trimmedLine) {
                            // Duplicate line, skip recording
                            return;
                        }
                        // Update the last recorded line
                        lastRecordedLinePerFile.set(file, trimmedLine);
                    }
                    results.push({
                        filename: file,
                        date: commit.date,
                        line: trimmedLine,
                    });
                });
            }
        }
    }

    return results;
}

/**
 * Outputs the results either to a CSV file, JSON file, or to the console, grouped by file.
 * @param {Array<{filename: string, date: string, line: string}>} results - List of results.
 * @param {string} [csvPath] - Path to the output CSV file.
 * @param {string} [jsonPath] - Path to the output JSON file.
 */
function outputResults(results, csvPath, jsonPath) {
    if (csvPath) {
        // Prepare CSV header
        const header = 'Filename,Date,Line\n';
        const csvLines = results.map(r => {
            // Escape double quotes by doubling them
            const safeLine = r.line.replace(/"/g, '""');
            return `"${r.filename}","${r.date}","${safeLine}"`;
        });
        const csvContent = header + csvLines.join('\n');
        fs.writeFileSync(csvPath, csvContent, 'utf8');
        console.log(`\nResults saved to CSV file: ${csvPath}`);
    }

    if (jsonPath) {
        // Group results by filename
        const grouped = results.reduce((acc, curr) => {
            if (!acc[curr.filename]) {
                acc[curr.filename] = [];
            }
            acc[curr.filename].push({ date: curr.date, line: curr.line });
            return acc;
        }, {});

        const jsonContent = JSON.stringify(grouped, null, 2);
        fs.writeFileSync(jsonPath, jsonContent, 'utf8');
        console.log(`Results saved to JSON file: ${jsonPath}`);
    }

    if (!csvPath && !jsonPath) {
        // No file output specified, print to console grouped by file
        const grouped = results.reduce((acc, curr) => {
            if (!acc[curr.filename]) {
                acc[curr.filename] = [];
            }
            acc[curr.filename].push({ date: curr.date, line: curr.line });
            return acc;
        }, {});

        for (const [file, entries] of Object.entries(grouped)) {
            console.log(`\nFile: ${file}`);
            entries.forEach(entry => {
                console.log(`  Date: ${entry.date}`);
                console.log(`  Line: ${entry.line}`);
                console.log('  ---');
            });
        }
    }
}

/**
 * Main execution function.
 */
(async () => {
    // Validate mutually exclusive options
    if (csvOutput && jsonOutput) {
        console.warn('Warning: Both CSV and JSON output options are specified. Both files will be generated.');
    }

    console.log(`Tracking keyword "${keyword}" in files matching "${filePattern}"${dedupe ? ' with deduplication enabled' : ''}...\n`);
    const commits = await getCommits(filePattern);
    console.log(`Found ${commits.length} commit${commits.length !== 1 ? 's' : ''} modifying the specified files.\n`);

    const results = await processCommits(commits, filePattern, keyword, dedupe);
    console.log(`\nFound ${results.length} occurrence${results.length !== 1 ? 's' : ''} of the keyword "${keyword}".\n`);

    outputResults(results, csvOutput, jsonOutput);
})();

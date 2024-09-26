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
    .option('-o, --output <file>', 'Path to save the output as a CSV file');

program.parse(process.argv);

const options = program.opts();
const { files: filePattern, keyword, output } = options;

/**
 * Fetches all commits that modified files matching the file pattern.
 * @param {string} filePattern - Glob pattern for target files.
 * @returns {Promise<Array<{hash: string, date: string}>>}
 */
async function getCommits(filePattern) {
    try {
        // Use git log to get commits that modified files matching the pattern
        // Git doesn't support glob patterns directly in log, so we use '**/pattern'
        const cmd = `git log --pretty=format:"%H|%ad" --date=iso -- ${filePattern}`;
        const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 10 }); // Increase buffer for large outputs
        const commits = stdout.split('\n').filter(line => line.trim() !== '').map(line => {
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
            return glob.hasMagic(filePattern) ? glob.sync(filePattern, { cwd: process.cwd(), matchBase: true }).includes(file) : file === filePattern;
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
        const lines = stdout.split('\n').filter(line => line.includes(keyword));
        return lines;
    } catch (error) {
        // File might not exist in this commit or other errors
        return [];
    }
}

/**
 * Processes all commits to find keyword occurrences.
 * @param {Array<{hash: string, date: string}>} commits - List of commits.
 * @param {string} filePattern - Glob pattern for target files.
 * @param {string} keyword - Keyword to search for.
 * @returns {Promise<Array<{filename: string, date: string, line: string}>>}
 */
async function processCommits(commits, filePattern, keyword) {
    const results = [];

    for (const [index, commit] of commits.entries()) {
        console.log(`Processing commit ${index + 1}/${commits.length}: ${commit.hash}`);

        const files = await getFilesInCommit(commit.hash, filePattern);

        for (const file of files) {
            const lines = await getKeywordLines(commit.hash, file, keyword);
            lines.forEach(line => {
                results.push({
                    filename: file,
                    date: commit.date,
                    line: line.trim(),
                });
            });
        }
    }

    return results;
}

/**
 * Outputs the results either to a CSV file or to the console.
 * @param {Array<{filename: string, date: string, line: string}>} results - List of results.
 * @param {string} [outputPath] - Path to the output CSV file.
 */
function outputResults(results, outputPath) {
    if (outputPath) {
        // Prepare CSV header
        const header = 'Filename,Date,Line\n';
        const csvLines = results.map(r => {
            // Escape double quotes by doubling them
            const safeLine = r.line.replace(/"/g, '""');
            return `"${r.filename}","${r.date}","${safeLine}"`;
        });
        const csvContent = header + csvLines.join('\n');
        fs.writeFileSync(outputPath, csvContent, 'utf8');
        console.log(`\nResults saved to ${outputPath}`);
    } else {
        // Print to console
        results.forEach(r => {
            console.log(`File: ${r.filename}`);
            console.log(`Date: ${r.date}`);
            console.log(`Line: ${r.line}`);
            console.log('---');
        });
    }
}

/**
 * Main execution function.
 */
(async () => {
    console.log(`Tracking keyword "${keyword}" in files matching "${filePattern}"...\n`);
    const commits = await getCommits(filePattern);
    console.log(`Found ${commits.length} commits modifying the specified files.\n`);

    const results = await processCommits(commits, filePattern, keyword);
    console.log(`\nFound ${results.length} occurrences of the keyword "${keyword}".\n`);

    outputResults(results, output);
})();

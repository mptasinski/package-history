#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

function extractArgs() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error('Error: Missing package name argument.');
        process.exit(1);
    }

    const [packageName, outputFile, packageJSON, repoPath] = args;

    return {
        packageName,
        outputFile: outputFile || 'output.json',
        packageJSON: packageJSON || 'package.json',
        repoPath: repoPath || ''
    };
}

// Helper function to execute Git commands
function runGitCommand(command, repoPath = '') {
    return new Promise((resolve, reject) => {
        exec(command, { cwd: repoPath || process.cwd() }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            } else {
                resolve(stdout);
            }
        });
    });
}

function saveOutputToFile(output, outputFile) {
    return new Promise((resolve, reject) => {
        fs.writeFile(outputFile, JSON.stringify(output, null, 2), 'utf8', (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        })
    });
}

function extractPackageFromFile(fileContent, packageName) {
    try {
        const packageJson = JSON.parse(fileContent);

        if (packageJson.dependencies && packageJson.dependencies[packageName]) {
            return packageJson.dependencies[packageName];
        }

        if (packageJson.devDependencies && packageJson.devDependencies[packageName]) {
            return packageJson.devDependencies[packageName];
        }

    } catch {
        return null;
    }
}

function dedupeByVersion(output) {
    const deduped = [];
    const seenVersions = new Set();

    for (const entry of output) {
        if (!seenVersions.has(entry.packageVersion)) {
            deduped.push(entry);
            seenVersions.add(entry.packageVersion);
        }
    }

    return deduped;
}

async function findPackageVersion(packageJSON, packageName, repoPath) {
    try {
        const repoDir = repoPath ? path.resolve(repoPath) : process.cwd();

        // Verify that the specified file exists in the repository
        try {
            await runGitCommand(`git ls-files --error-unmatch "${packageJSON}"`, repoDir);
        } catch {
            console.error(`Error: The file "${packageJSON}" does not exist in the repository.`);
            process.exit(1);
        }


        // Fetch the commit history for the specified file
        const gitLogCommand = `git log --pretty=format:"%H %ad" --date=short -- "${packageJSON}"`;
        const gitLogOutput = await runGitCommand(gitLogCommand, repoDir);

        if (!gitLogOutput.trim()) {
            console.log(`No commits found for the file: ${packageJSON}`);
            process.exit(0);
        }

        const commits = gitLogOutput.trim().split('\n').map(line => {
            const [hash, date] = line.split(' ');
            return { hash, date };
        });

        console.log(`Found ${commits.length} commits for the file: ${packageJSON}`);

        // Extract base filename and extension
        const outputVersionLog = [];

        // Iterate over each commit and extract the file version
        for (const commit of commits) {
            const { hash, date } = commit;

            // Fetch the file content at the specific commit
            const gitShowCommand = `git show ${hash}:"${packageJSON}"`;
            try {
                const fileContent = await runGitCommand(gitShowCommand, repoDir);
                const packageVersion = extractPackageFromFile(fileContent, packageName);
                if (packageVersion) {
                    outputVersionLog.push({ hash, date, packageVersion });
                }
            } catch (error) {
                console.error(`Failed to extract file at commit ${hash}: ${error.message}`);
            }
        }

        console.log('File history extraction complete.');
        return dedupeByVersion(outputVersionLog);
    } catch (error) {
        console.error(`An error occurred: ${error.message}`);
        process.exit(1);
    }
}

function findAllPackageJSONFiles(repoPath, packageJSON) {
    return new Promise((resolve, reject) => {
        exec(`git ls-files --error-unmatch "${packageJSON}"`, { cwd: repoPath || process.cwd() }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            } else {
                resolve(stdout.trim().split('\n'));
            }
        });
    });
}

async function main({ packageName, outputFile, packageJSON, repoPath }) {
    const repoDir = repoPath ? path.resolve(repoPath) : process.cwd();
    const packageJSONFiles = await findAllPackageJSONFiles(repoDir, packageJSON);

    if (packageJSONFiles.length === 0) {
        console.error('No package.json files found in the repository.');
        process.exit(1);
    }

    const output = [];

    for (const packageJSON of packageJSONFiles) {
        console.log(`Extracting history for: ${packageJSON}`);
        const history = await findPackageVersion(packageJSON, packageName, repoDir, `${packageJSON}_${outputFile}`);

        output.push({ packageJSON, history });
    }

    await saveOutputToFile(output, outputFile);

}
(async () => {
    const args = extractArgs();
    await main(args);
})();
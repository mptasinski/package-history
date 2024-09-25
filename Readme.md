# Package history


CLI tool to extract the version history of a specific package from a Git repository.

Usage:
`node index.js <package-name> <output-file> <package-json-file> <repo-path>`

* `package-name`: The name of the package to extract the version history for.
* `output-file`: optional The output file to store the extracted version history. Default is "output.json".
* `package-json-file`: optional The package.json file to search for the package version. Default is "package.json".
* `repo-path`: Optional path to the Git repository. Leave empty to use the current directory.

Example:
```bash
node index.js "jest"
node index.js "jest" "jest-history.json"
node index.js "jest" "jest-history.json" "package.json" "/path/to/repo"
node index.js "jest" "jest-history.json" "**/package.json" "/path/to/repo"
```
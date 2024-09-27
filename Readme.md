Usage
Run the script using Node.js with the following options:

```bash
node trackKeyword.js --files "<file_pattern>" --keyword "<keyword>" [--csv "<csv_file>"] [--json "<json_file>"] [--dedupe]
Command-Line Options
-f, --files <pattern>: (Required) Glob pattern to specify target files (e.g., **/package.json).
-k, --keyword <word>: (Required) Keyword to search for within the files (e.g., lodash).
-c, --csv <file>: (Optional) Path to save the output as a CSV file.
-j, --json <file>: (Optional) Path to save the output as a JSON file.
-d, --dedupe: (Optional) Enable deduplication to record only unique changes per file.
```
Examples
Track All Occurrences Without Deduplication and Print to Console

```bash
node trackKeyword.js --files "**/package.json" --keyword "lodash"
```
Output: All occurrences of "lodash" in all package.json files, grouped by file, printed to the console.

Track All Occurrences and Save to CSV

```bash
node trackKeyword.js --files "**/package.json" --keyword "lodash" --csv version_history.csv
```
Output: All occurrences saved in version_history.csv, grouped by file.

Track Only Unique Changes per File (Deduplication Enabled)

```bash
node trackKeyword.js --files "**/package.json" --keyword "lodash" --dedupe
```
Output: Only unique changes of "lodash" in each package.json file, printed to the console.

Combine Deduplication and JSON Output

```bash
node trackKeyword.js --files "**/package.json" --keyword "lodash" --json version_history_deduped.json --dedupe
```
Output: Unique changes per file saved in version_history_deduped.json.

Generate Both CSV and JSON Outputs

```bash
node trackKeyword.js --files "**/package.json" --keyword "lodash" --csv version_history.csv --json version_history.json
```
Output: Both version_history.csv and version_history.json files will be generated. A warning will be displayed indicating that both outputs are being created.

Output Formats
Console Output
If neither --csv nor --json options are specified, the results are printed to the console, grouped by file.

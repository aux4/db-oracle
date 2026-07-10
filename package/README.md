# aux4/db-oracle

Oracle database tools for the aux4 CLI.

The `aux4/db-oracle` package provides seamless integration with Oracle databases directly from your command line. It uses the `oracledb` thin client (no Oracle client installation needed). You can execute SQL queries, perform batch inserts, stream results for large datasets, manage transactions, and handle errors gracefully. Ideal for quick prototypes, ETL pipelines, automation scripts, and interactive database tasks without writing custom scripts.

## Installation

```bash
aux4 aux4 pkger install aux4/db-oracle
```

## Quick Start

Connect to a database, create a table, insert a record, and query data:

```bash
# Create a users table
aux4 db oracle execute \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "CREATE TABLE users (id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name VARCHAR2(255), age NUMBER, email VARCHAR2(255))"

# Insert a user and return the inserted row as JSON
aux4 db oracle execute \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "INSERT INTO users (name, age, email) VALUES ('Alice', 30, 'alice@example.com')"
```

## Usage

### Main Commands

- [`aux4 db oracle execute`](./commands/db/oracle/execute) - Execute SQL statements on an Oracle database and return all results as a JSON array.
- [`aux4 db oracle stream`](./commands/db/oracle/stream) - Execute SQL statements and stream each row as a newline-delimited JSON object.

### Command Reference

#### aux4 db oracle execute

Run one or more SQL statements on an Oracle database and collect all results in memory.

Usage:
```bash
aux4 db oracle execute \
  [--host <hostname>] \
  [--port <port>] \
  [--database <service_name>] \
  [--user <username>] \
  [--password <password>] \
  [--query "<SQL>"] \
  [--file <script.sql>] \
  [--inputStream] \
  [--tx] \
  [--ignore]
```

Options:

- `--host <hostname>`     Database host (default: `localhost`)
- `--port <port>`         Database port (default: `1521`)
- `--database <service>`  Database service name (default: `XEPDB1`)
- `--user <username>`     Database user (default: `system`)
- `--password <password>` Database password
- `--query "<SQL>"`      SQL statement to execute (positional if `arg: true`)
- `--file <sql_file.sql>` Execute SQL from a file
- `--inputStream`         Read a JSON array from stdin as input parameters
- `--tx`                  Wrap all operations in a single transaction
- `--ignore`              Ignore errors and continue processing, reporting failures

Examples:

```bash
# Named-parameter insert
aux4 db oracle execute \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" \
  --name Bob --age 25 --email bob@example.com

# Batch insert from JSON via stdin
echo '[{"name":"Carol","age":22,"email":"carol@example.com"}]' | \
  aux4 db oracle execute \
    --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
    --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" \
    --inputStream

# Transactional insert (rollback on error)
echo '[{"name":"Tx1","age":40,"email":"tx1@example.com"},{"name":""}]' | \
  aux4 db oracle execute \
    --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
    --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" \
    --inputStream --tx
```

#### aux4 db oracle stream

Stream query results row-by-row for large datasets or piping into other commands.

Usage:
```bash
aux4 db oracle stream \
  [--host <hostname>] \
  [--port <port>] \
  [--database <service_name>] \
  [--user <username>] \
  [--password <password>] \
  [--query "<SQL>"] \
  [--file <script.sql>] \
  [--inputStream] \
  [--tx] \
  [--ignore]
```

Options are the same as `execute`, but results are emitted as newline-delimited JSON objects.

Examples:

```bash
# Stream all users
aux4 db oracle stream \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "SELECT * FROM users ORDER BY id"

# Stream with a filter parameter
aux4 db oracle stream \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "SELECT name, email FROM users WHERE age >= :minAge ORDER BY name" \
  --minAge 30

# ETL pipeline: stream and immediately insert into audit table
aux4 db oracle stream \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "SELECT id, name FROM users" | \
  aux4 db oracle stream \
    --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
    --query "INSERT INTO user_audit (user_id, audit_name) VALUES (:id, :name)" \
    --inputStream
```

## Output Formats

### Execute Command Output

The `execute` command returns results as JSON arrays:

**Success:**
```json
[
  {"ID": 1, "NAME": "Alice", "AGE": 30, "EMAIL": "alice@example.com"},
  {"ID": 2, "NAME": "Bob", "AGE": 25, "EMAIL": "bob@example.com"}
]
```

**Errors (to stderr):**
```json
[{"item": {"name": "Bad Data"}, "query": "INSERT INTO users...", "error": "ORA-01400: cannot insert NULL into ..."}]
```

### Stream Command Output

The `stream` command returns newline-delimited JSON objects (NDJSON):

```json
{"ID": 1, "NAME": "Alice", "AGE": 30, "EMAIL": "alice@example.com"}
{"ID": 2, "NAME": "Bob", "AGE": 25, "EMAIL": "bob@example.com"}
```

**Errors (to stderr):**
```json
{"item": {}, "query": "SELECT invalid_column FROM users", "error": "ORA-00904: \"INVALID_COLUMN\": invalid identifier"}
```

## Advanced Features

### Batch Processing with inputStream

Process multiple records from JSON input:

```bash
# Create JSON file with batch data
cat > users.json << EOF
[
  {"name": "User1", "age": 25, "email": "user1@example.com"},
  {"name": "User2", "age": 30, "email": "user2@example.com"}
]
EOF

# Execute batch insert
cat users.json | aux4 db oracle execute \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" \
  --inputStream
```

### Parameter Override

CLI parameters override JSON input parameters:

```bash
# Override email for all records in the batch
cat users.json | aux4 db oracle execute \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" \
  --email "override@example.com" \
  --inputStream
```

### Transaction Management

**With transactions (`--tx`):**
- All operations execute within a single transaction
- On error, all changes are rolled back
- Ensures data consistency for batch operations

```bash
# Transactional batch - all or nothing
cat batch.json | aux4 db oracle execute \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" \
  --inputStream --tx
```

**Without transactions:**
- Each operation commits individually (autoCommit)
- Successful operations persist even if later ones fail
- Faster for large batches but less consistent

### Error Handling

**Default behavior (`--ignore` not set):**
- Stop on first error
- Exit with non-zero code
- Error details sent to stderr

**With `--ignore` flag:**
- Continue processing remaining records
- Output successful results to stdout
- Send errors to stderr but exit with zero code

```bash
# Process all records, ignoring failures
cat mixed_data.json | aux4 db oracle execute \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" \
  --inputStream --ignore
```

## Oracle-Specific Notes

- Uses `oracledb` thin client mode (no Oracle Client installation required)
- Column names in query results are returned in UPPERCASE by default
- Oracle uses `:paramName` natively for bind variables (no parameter syntax conversion needed)
- Connection string format: `host:port/service_name`
- Oracle does not support `RETURNING *` syntax; use `RETURNING column1, column2 INTO :out1, :out2` for DML returning clauses, or query after insert
- For auto-incrementing IDs, use `NUMBER GENERATED ALWAYS AS IDENTITY`
- Use `DUAL` table for testing expressions: `SELECT 1 FROM DUAL`

## Examples

### Basic Query

```bash
aux4 db oracle execute \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "SELECT * FROM users"
```

### Insert with Named Parameters

```bash
aux4 db oracle execute \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" \
  --name "Dave" --age 45 --email dave@example.com
```

### Query with Parameters

```bash
aux4 db oracle execute \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "SELECT * FROM users WHERE age >= :minAge AND email LIKE :domain" \
  --minAge 25 --domain "%@example.com"
```

### Transaction Rollback Demonstration

```bash
# Good and bad records in a single batch; --tx rolls back all if any fail
echo '[{"name":"Good","age":20,"email":"good@example.com"},{"name":null}]' | \
  aux4 db oracle execute \
    --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
    --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" \
    --inputStream --tx
```

### Stream Processing Pipeline

```bash
# Create audit table
aux4 db oracle execute \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "CREATE TABLE user_audit (audit_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id NUMBER, user_name VARCHAR2(255), audit_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"

# Stream users and insert audit records
aux4 db oracle stream \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "SELECT id, name FROM users WHERE age >= 25" | \
  aux4 db oracle stream \
    --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
    --query "INSERT INTO user_audit (user_id, user_name) VALUES (:id, :name)" \
    --inputStream
```

### Error Recovery with --ignore

```bash
# Process mixed data, continuing despite errors
cat > mixed_data.json << EOF
[
  {"name": "Valid User", "age": 30, "email": "valid@example.com"},
  {"invalid_field": "bad data"},
  {"name": "Another Valid User", "age": 25, "email": "another@example.com"}
]
EOF

cat mixed_data.json | aux4 db oracle execute \
  --host localhost --port 1521 --database XEPDB1 --user system --password mypass \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" \
  --inputStream --ignore
```

## License

Apache-2.0

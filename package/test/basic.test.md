# Basic Database Operations

```beforeAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "CREATE TABLE users (id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name VARCHAR2(255), age NUMBER, email VARCHAR2(255))"
```

```afterAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "DROP TABLE users"
```

## Insert single record

```execute
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "INSERT INTO users (name, age, email) VALUES ('John', 28, 'john@example.com')"
```

```expect
[]
```

## Query inserted record

```execute
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "SELECT name, age, email FROM users WHERE name = 'John'" | jq .
```

```expect
[
  {
    "NAME": "John",
    "AGE": 28,
    "EMAIL": "john@example.com"
  }
]
```

## Insert using parameters

```execute
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" --name Peter --age 55 --email peter@nothere.com
```

```expect
[]
```

## Query parameter-inserted record

```execute
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "SELECT name, age, email FROM users WHERE name = 'Peter'" | jq .
```

```expect
[
  {
    "NAME": "Peter",
    "AGE": 55,
    "EMAIL": "peter@nothere.com"
  }
]
```

## Insert using JSON file

```file:users.json
[
  {
    "name": "Alice",
    "age": 30,
    "email": "alice@person.com"
  },
  {
    "name": "Bob",
    "age": 25,
    "email": "bob@person.com"
  }
]
```

### Only the values from the file

```execute
cat users.json | aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" --inputStream
```

```expect
{"success":true,"count":2}
```

### Overriding one of the parameters

```execute
cat users.json | aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" --email noemail@example.com --inputStream
```

```expect
{"success":true,"count":2}
```

## Query all records

```execute
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "SELECT name, age, email FROM users ORDER BY id" | jq .
```

```expect
[
  {
    "NAME": "John",
    "AGE": 28,
    "EMAIL": "john@example.com"
  },
  {
    "NAME": "Peter",
    "AGE": 55,
    "EMAIL": "peter@nothere.com"
  },
  {
    "NAME": "Alice",
    "AGE": 30,
    "EMAIL": "alice@person.com"
  },
  {
    "NAME": "Bob",
    "AGE": 25,
    "EMAIL": "bob@person.com"
  },
  {
    "NAME": "Alice",
    "AGE": 30,
    "EMAIL": "noemail@example.com"
  },
  {
    "NAME": "Bob",
    "AGE": 25,
    "EMAIL": "noemail@example.com"
  }
]
```

## Stream mode

### Query all users as stream

```execute
aux4 db oracle stream --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "SELECT name, age, email FROM users ORDER BY id"
```

```expect
{"NAME":"John","AGE":28,"EMAIL":"john@example.com"}
{"NAME":"Peter","AGE":55,"EMAIL":"peter@nothere.com"}
{"NAME":"Alice","AGE":30,"EMAIL":"alice@person.com"}
{"NAME":"Bob","AGE":25,"EMAIL":"bob@person.com"}
{"NAME":"Alice","AGE":30,"EMAIL":"noemail@example.com"}
{"NAME":"Bob","AGE":25,"EMAIL":"noemail@example.com"}
```

### Stream with parameters

```execute
aux4 db oracle stream --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "SELECT name, email FROM users WHERE age >= :minAge ORDER BY name" --minAge 30
```

```expect
{"NAME":"Alice","EMAIL":"alice@person.com"}
{"NAME":"Alice","EMAIL":"noemail@example.com"}
{"NAME":"Peter","EMAIL":"peter@nothere.com"}
```

## Stream piping

```beforeAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "CREATE TABLE user_audit (audit_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id NUMBER, user_name VARCHAR2(255), user_email VARCHAR2(255), audit_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
```

```afterAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "DROP TABLE user_audit"
```

### Stream users and insert into audit table

```execute
aux4 db oracle stream --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "SELECT id, name, email FROM users WHERE age >= 25 ORDER BY id" | aux4 db oracle stream --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "INSERT INTO user_audit (user_id, user_name, user_email) VALUES (:ID, :NAME, :EMAIL)" --inputStream
```

```expect
```

### Verify audit records count

```execute
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "SELECT COUNT(*) as AUDIT_COUNT FROM user_audit" | jq .
```

```expect
[
  {
    "AUDIT_COUNT": 6
  }
]
```

## Transaction Tests

### Execute with Transaction - Good Input

```file:good_transaction_users.json
[
  {
    "name": "Transaction User 1",
    "age": 35,
    "email": "txuser1@example.com"
  },
  {
    "name": "Transaction User 2",
    "age": 42,
    "email": "txuser2@example.com"
  }
]
```

#### With Transaction

```execute
cat good_transaction_users.json | aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" --inputStream --tx
```

```expect
{"success":true,"count":2}
```

#### Without Transaction

```execute
cat good_transaction_users.json | aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" --inputStream
```

```expect
{"success":true,"count":2}
```

### Stream with Transaction - Good Input

```file:good_transaction_users.json
[
  {
    "name": "Transaction User 1",
    "age": 35,
    "email": "txuser1@example.com"
  },
  {
    "name": "Transaction User 2",
    "age": 42,
    "email": "txuser2@example.com"
  }
]
```

#### With Transaction

```execute
cat good_transaction_users.json | aux4 db oracle stream --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" --inputStream --tx
```

```expect
```

#### Without Transaction

```execute
cat good_transaction_users.json | aux4 db oracle stream --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email)" --inputStream
```

```expect
```

## Error Handling Tests

### Test invalid SQL query error

```execute
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "SELECT * FROM nonexistent_table"
```

```error
[{"item":{},"query":"SELECT * FROM nonexistent_table","error":"ORA-00942: table or view does not exist"}]
```

### Test stream error with invalid query

```execute
aux4 db oracle stream --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "SELECT invalid_column FROM users"
```

```error
{"item":{},"query":"SELECT invalid_column FROM users","error":"ORA-00904: \"INVALID_COLUMN\": invalid identifier"}
```

## Ignore Errors Tests

### Test execute with --ignore flag - single error

```execute
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "SELECT * FROM nonexistent_table" --ignore
```

```expect

```

```error
[{"item":{},"query":"SELECT * FROM nonexistent_table","error":"ORA-00942: table or view does not exist"}]
```

### Test stream with --ignore flag and error

```execute
aux4 db oracle stream --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "SELECT invalid_column FROM users" --ignore
```

```expect

```

```error
{"item":{},"query":"SELECT invalid_column FROM users","error":"ORA-00904: \"INVALID_COLUMN\": invalid identifier"}
```

## Test dual table

```execute
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "SELECT 1 AS VAL FROM DUAL" | jq .
```

```expect
[
  {
    "VAL": 1
  }
]
```

# Schema Introspection

```beforeAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "CREATE USER introspect_test IDENTIFIED BY testpass"
```

```beforeAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "ALTER USER introspect_test QUOTA UNLIMITED ON USERS"
```

```beforeAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "CREATE TABLE introspect_test.product (id NUMBER PRIMARY KEY, name VARCHAR2(100) NOT NULL, price NUMBER(10,2) DEFAULT 0, sku VARCHAR2(50))"
```

```beforeAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "CREATE TABLE introspect_test.tag (id NUMBER PRIMARY KEY)"
```

```beforeAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "COMMENT ON TABLE introspect_test.product IS 'Catalog of products for sale'"
```

```beforeAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "COMMENT ON COLUMN introspect_test.product.id IS 'Unique product identifier'"
```

```beforeAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "COMMENT ON COLUMN introspect_test.product.name IS 'Product display name'"
```

```beforeAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "COMMENT ON COLUMN introspect_test.product.price IS 'Unit price in USD'"
```

```afterAll
aux4 db oracle execute --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --query "DROP USER introspect_test CASCADE"
```

## Describe a table

### should return canonical column metadata, dropping null and empty fields

```execute
aux4 db oracle describe --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --schema introspect_test --table product
```

```expect:json
[
  {
    "name": "ID",
    "type": "NUMBER",
    "nullable": false,
    "key": "PRI",
    "comment": "Unique product identifier"
  },
  {
    "name": "NAME",
    "type": "VARCHAR2",
    "nullable": false,
    "comment": "Product display name"
  },
  {
    "name": "PRICE",
    "type": "NUMBER",
    "nullable": true,
    "default": "0",
    "comment": "Unit price in USD"
  },
  {
    "name": "SKU",
    "type": "VARCHAR2",
    "nullable": true
  }
]
```

### should match a table case-insensitively (identifiers are stored UPPERCASE)

```execute
aux4 db oracle describe --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --schema introspect_test --table PRODUCT | jq -c 'map(.name)'
```

```expect
["ID","NAME","PRICE","SKU"]
```

### should keep only present keys per row (null/empty dropped, in column order)

```execute
aux4 db oracle describe --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --schema introspect_test --table product | jq -c 'map(keys_unsorted)'
```

```expect
[["name","type","nullable","key","comment"],["name","type","nullable","comment"],["name","type","nullable","default","comment"],["name","type","nullable"]]
```

### should reduce a plain column to just name, type, nullable

```execute
aux4 db oracle describe --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --schema introspect_test --table product | jq -c '.[3]'
```

```expect
{"name":"SKU","type":"VARCHAR2","nullable":true}
```

### should never emit a null or empty-string value

```execute
aux4 db oracle describe --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --schema introspect_test --table product | jq -c '[.[] | to_entries[] | .value] | map(select(. == null or . == "")) | length'
```

```expect
0
```

### should emit nullable as a real JSON boolean (not "Y"/"N", not 1/0)

```execute
aux4 db oracle describe --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --schema introspect_test --table product | jq -c 'map(.nullable | type)'
```

```expect
["boolean","boolean","boolean","boolean"]
```

## Describe a table with the desc alias

### should behave the same as describe

```execute
aux4 db oracle desc --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --schema introspect_test --table product
```

```expect:json
[
  {
    "name": "ID",
    "type": "NUMBER",
    "nullable": false,
    "key": "PRI",
    "comment": "Unique product identifier"
  },
  {
    "name": "NAME",
    "type": "VARCHAR2",
    "nullable": false,
    "comment": "Product display name"
  },
  {
    "name": "PRICE",
    "type": "NUMBER",
    "nullable": true,
    "default": "0",
    "comment": "Unit price in USD"
  },
  {
    "name": "SKU",
    "type": "VARCHAR2",
    "nullable": true
  }
]
```

## List tables

### should list tables qualified by schema (owner), with comments when present

```execute
aux4 db oracle list tables --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --schema introspect_test
```

```expect:json
[
  {
    "name": "PRODUCT",
    "schema": "INTROSPECT_TEST",
    "comment": "Catalog of products for sale"
  },
  {
    "name": "TAG",
    "schema": "INTROSPECT_TEST"
  }
]
```

### should keep only present keys per row (empty comment dropped)

```execute
aux4 db oracle list tables --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --schema introspect_test | jq -c 'map(keys_unsorted)'
```

```expect
[["name","schema","comment"],["name","schema"]]
```

### should never emit a null or empty-string value

```execute
aux4 db oracle list tables --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword --schema introspect_test | jq -c '[.[] | to_entries[] | .value] | map(select(. == null or . == "")) | length'
```

```expect
0
```

## List schemas

### should include a user schema in the server listing

```execute
aux4 db oracle list schemas --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword | jq -c 'map(.name) | index("INTROSPECT_TEST") != null'
```

```expect
true
```

### should return one canonical {name} object per schema

```execute
aux4 db oracle list schemas --host localhost --port 1521 --database XEPDB1 --user system --password mysecretpassword | jq -c '[.[] | keys] | unique'
```

```expect
[["name"]]
```

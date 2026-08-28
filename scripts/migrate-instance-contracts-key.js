const mysql = require("mysql2/promise");

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root",
    database: process.env.DB_NAME || "merge",
    multipleStatements: false,
  });

  try {
    const [columns] = await connection.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'power_instancecontracts'
          AND COLUMN_NAME = 'id'
      `,
    );

    if (!columns.length) {
      await connection.query("ALTER TABLE power_instancecontracts ADD COLUMN id VARCHAR(128) NULL FIRST");
      await connection.query(
        "UPDATE power_instancecontracts SET id = CONCAT('instance-contracts-', REPLACE(UUID(), '-', '')) WHERE id IS NULL OR id = ''",
      );
      await connection.query("ALTER TABLE power_instancecontracts MODIFY COLUMN id VARCHAR(128) NOT NULL");
    }

    const [primaryRows] = await connection.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'power_instancecontracts'
          AND CONSTRAINT_NAME = 'PRIMARY'
        ORDER BY ORDINAL_POSITION
      `,
    );
    const primaryColumns = primaryRows.map((row) => row.COLUMN_NAME);

    if (primaryColumns.length !== 1 || primaryColumns[0] !== "id") {
      await connection.query("ALTER TABLE power_instancecontracts DROP PRIMARY KEY, ADD PRIMARY KEY (id)");
    }

    const [uniqueRows] = await connection.query(
      `
        SELECT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'power_instancecontracts'
          AND INDEX_NAME = 'uk_InstanceContracts_contract_country_device'
        LIMIT 1
      `,
    );

    if (!uniqueRows.length) {
      await connection.query(
        "ALTER TABLE power_instancecontracts ADD UNIQUE KEY uk_InstanceContracts_contract_country_device (contractNo, countryCode, deviceCode)",
      );
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

const JSONSchemaSequelizer = require('..');

module.exports.setup = (options, refs, cwd) => {
  const config = {
    username: process.env.CI ? 'postgres' : process.env.LOGNAME,
    password: process.env.CI ? 'postgres' : undefined,
    database: process.env.CI ? 'ci_db_test' : 'test',
    host: process.env.CI ? process.env.POSTGRES_HOST : '0.0.0.0',
    port: process.env.CI ? process.env.POSTGRES_PORT : 5432,
    dialect: options.dialect,
    storage: options.storage,
    logging: options.logging || false,
    define: options.define || {
      timestamps: false,
      freezeTableName: true,
    },
  };

  return new JSONSchemaSequelizer(config, refs, cwd);
};

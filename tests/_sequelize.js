const JSONSchemaSequelizer = require('..');

module.exports.setup = (options, refs, cwd) => {
  const config = {
    username: process.env.CI ? 'postgres' : process.env.LOGNAME,
    database: process.env.CI ? 'travis_ci_test' : 'test',
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

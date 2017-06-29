JSONSchemaSequelizer = require('..')
jss = null

module.exports.setup = (options, refs, cwd) ->
  jss = new JSONSchemaSequelizer
    username: if process.env.CI then 'postgres' else process.env.LOGNAME
    database: if process.env.CI then 'travis_ci_test' else 'test'
    dialect: options.dialect
    storage: options.storage
    logging: options.logging or false
    define:
      timestamps: false
      freezeTableName: true
    , refs, cwd

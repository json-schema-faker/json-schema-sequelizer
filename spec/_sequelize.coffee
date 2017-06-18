Sequelize = require('sequelize')
sequelize = null

module.exports.setup = (dialect, storage, logging) ->
  sequelize = new Sequelize
    username: if process.env.CI then 'postgres' else process.env.LOGNAME
    database: if process.env.CI then 'travis_ci_test' else 'test'
    dialect: dialect
    storage: storage
    logging: logging or false
    define:
      timestamps: false
      freezeTableName: true
  null

module.exports.define = (name, schema, properties) ->
  sequelize.define name, schema, properties

module.exports.sequelize = ->
  sequelize

t = require('./_sequelize')
types = require('../lib/types')

describe 'Types support', ->
  describe 'cleanSchema()', ->
    it 'should remove non json-schema props', ->
      test =
        properties:
          another:
            allOf: [type: 'boolean', a: 'b']
            x: 'y'
        items:
          type: 'number'
          baz: 'buzz'
        type: 'string'
        $ref: 'other'
        foo: 'bar'

      expect(types.cleanSchema(test)).toEqual
        $ref: 'other'
        type: 'string'
        items: type: 'number'
        properties:
          another: type: 'boolean'

  describe 'convertSchema()', ->
    it 'should transform json-schema into sequelize models', (done) ->
      test =
        $schema:
          id: 'Test'
          properties:
            str: type: 'string'
            num: type: 'number'
            bol: type: 'boolean'
            foo: enum: ['bar', 'baz']
          required: ['str', 'num', 'bol']

      jss = t.setup
        dialect: 'sqlite'
        storage: ':memory:'

      m = null

      jss.add(test).connect()
        .then -> jss.models.Test.sync()
        .then -> jss.models.Test.describe()
        .then (details) ->
          expect(details).toEqual
            id:
              type: 'INTEGER'
              allowNull: true
              defaultValue: undefined
              primaryKey: true
            str:
              type: 'VARCHAR(255)'
              allowNull: false
              defaultValue: undefined
              primaryKey: false
            num:
              type: 'DECIMAL'
              allowNull: false
              defaultValue: undefined
              primaryKey: false
            bol:
              type: 'TINYINT(1)'
              allowNull: false
              defaultValue: undefined
              primaryKey: false
            foo:
              type: 'TEXT'
              allowNull: true
              defaultValue: undefined
              primaryKey: false
          jss.close()
          done()

  describe 'constraintSchema()', ->
    it 'should translate constraints from json-schema as validation rules', ->
      test =
        type: 'string'
        minLength: 10
        maxLength: 30

      expect(types.constraintSchema(test).validate).toEqual { len: [10, 30] }

  describe 'Postgres', ->
    it 'should support ENUM types', (done) ->
      test =
        $schema:
          id: 'Test'
          properties:
            foo: enum: ['bar', 'baz']
          required: ['foo']

      jss = t.setup
        dialect: 'postgres'

      jss.add(test).connect()
        .then -> jss.models.Test.sync()
        .then -> jss.models.Test.create({ foo: 'bar' })
        .then (x) ->
          expect(x.foo).toEqual 'bar'
          jss.close()
          done()
        .catch (e) ->
          console.log 'E_TYPES', e
          done()

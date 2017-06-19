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
    it 'should transform json-schema into sequelize models', ->
      test =
        properties:
          str: type: 'string'
          num: type: 'number'
          bol: type: 'boolean'
          foo: enum: ['bar', 'baz']
        required: ['str', 'num', 'bol']

      t.setup 'sqlite', ':memory:'

      m = null

      expect(->
        m = t.define 'test', types.convertSchema(test).props
        expect(m.name).toEqual 'test'
      ).not.toThrow()

  describe 'constraintSchema()', ->
    it 'should translate constraints from json-schema as validation rules', ->
      test =
        type: 'string'
        minLength: 10
        maxLength: 30

      expect(types.constraintSchema(test)).toEqual { validate: len: [10, 30] }

  describe 'Postgres', ->
    it 'should support ENUM types', (done) ->
      test =
        properties:
          foo: enum: ['bar', 'baz']
        required: ['foo']

      t.setup 'postgres'
      m = t.define 'test', types.convertSchema(test).props
      m.sync({ force: true })
      .then((m) -> m.create({ foo: 'bar' }))
      .then (x) ->
        expect(x.foo).toEqual 'bar'
        t.close()
        done()

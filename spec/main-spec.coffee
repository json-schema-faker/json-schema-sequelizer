t = require('./_sequelize')
$ = require('../lib')

refs = [
  {
    id: 'dataTypes'
    definitions:
      primaryKey:
        allOf: [
          { type: 'integer' }
          { primaryKey: true }
          { autoIncrement: true }
        ]
  }
]

Blog = {
  $schema:
    id: 'Blog'
    type: 'object'
    properties:
      id: $ref: 'dataTypes#/definitions/primaryKey'
      name: type: 'string'
    required: ['id', 'name']
}

describe 'sequelizer()', ->
  it 'should support simple models', ->
    t.setup 'sqlite', ':memory:'

    models = $ t.sequelize(), [Blog], refs

    expect(models.Blog.$schema).toEqual Blog.$schema

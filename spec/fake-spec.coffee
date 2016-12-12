fake = require('../lib/fake')

describe 'Fake support', ->
  beforeEach ->
    schema =
      type: 'object'
      properties:
        str: type: 'string'
        num: type: 'integer'
        bol: type: 'boolean'
      required: ['str', 'num', 'bol']

    refs = []

    @model = fake schema, refs

  it 'should support findOne()', ->
    result = @model.findOne()

    expect(typeof result.str).toEqual 'string'
    expect(typeof result.num).toEqual 'number'
    expect(typeof result.bol).toEqual 'boolean'

  it 'should support findAll()', ->
    results = @model.findAll()

    expect(typeof results[0].str).toEqual 'string'
    expect(typeof results[0].num).toEqual 'number'
    expect(typeof results[0].bol).toEqual 'boolean'

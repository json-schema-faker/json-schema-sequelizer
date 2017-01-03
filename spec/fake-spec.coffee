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

    @model = fake schema

  it 'should support findOne()', (done) ->
    @model.findOne().then (result) ->
      expect(typeof result.str).toEqual 'string'
      expect(typeof result.num).toEqual 'number'
      expect(typeof result.bol).toEqual 'boolean'
      done()

  it 'should support findAll()', (done) ->
    @model.findAll().then (results) ->
      expect(typeof results[0].str).toEqual 'string'
      expect(typeof results[0].num).toEqual 'number'
      expect(typeof results[0].bol).toEqual 'boolean'
      done()

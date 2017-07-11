JSONSchemaSequelizer = require('../lib')
t = require('./_sequelize')

describe 'Resources', ->
  beforeEach (done) ->
    @ctx =
      params:
        id: 1

      resources:
        Test:
          controller: 'Test'

    @jss = t.setup
      dialect: 'sqlite'
      storage: ':memory:'

    @jss.add
      $schema:
        id: 'Test'
        properties:
          value:
            type: 'string'

    @jss.sync({ force: true })
      .then =>
        @jss.models.Test.create(value: 'foo')
      .then =>
        @jss.models.Test.create(value: 'bar')
      .then =>
        @res = JSONSchemaSequelizer.resource(@jss.models.Test)

        # required for actions
        @jss.models.Test.options.$attributes =
          findAll: [
            { prop: 'value' }
          ]

        done()

  it 'responds to findAll (index)', (done) ->
    @res.actions.findAll()
    .then (result) ->
      expect(result[0].value).toEqual 'foo'
      expect(result[1].value).toEqual 'bar'
      done()

  it 'responds to findOne (edit|show)', (done) ->
    @res.actions.findOne()
    .then (result) ->
      expect(result.value).toEqual 'foo'
      done()

  it 'responds to create', (done) ->
    @res.actions.create(value: 'OSOM')
      .then (result) ->
        expect(result.value).toEqual 'OSOM'
        done()

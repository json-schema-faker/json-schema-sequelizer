JSONSchemaSequelizer = require('../lib')
t = require('./_sequelize')

describe 'Resources', ->
  beforeEach (done) ->
    @ctx =
      routes: (x) ->
        if x is 'Test'
          url =
            url: -> '/test'
            path: '/test'
            verb: 'GET'
          url.new = url: (-> '/test'), path: '/test', verb: 'GET'
          url.edit = url: (-> '/test/:id/edit'), path: '/test/:id/edit', verb: 'GET'
          url.show = url: (-> '/test/:id'), path: '/test/:id', verb: 'GET'
          url.create = url: (-> '/test'), path: '/test', verb: 'POST'
          url.update = url: (-> '/test/:id'), path: '/test/:id', verb: 'PUT'
          url.destroy = url: (-> '/test/:id'), path: '/test/:id', verb: 'DELETE'
          url

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
      .then ->
        done()

  it 'responds to index', (done) ->
    JSONSchemaSequelizer.resource(@ctx, @jss.models.Test, 'index')
      .then (result) ->
        expect(result.data).toEqual []
        done()

  it 'responds to new', (done) ->
    JSONSchemaSequelizer.resource(@ctx, @jss.models.Test, 'new')
      .then (result) ->
        expect(result.isNew).toBe true
        done()

  it 'responds to create', (done) ->
    @ctx.params.payload =
      value: 'OSOM'

    JSONSchemaSequelizer.resource(@ctx, @jss.models.Test, 'create')
      .then (data) ->
        expect(data.result.value).toEqual 'OSOM'
        done()

  it 'responds to edit', (done) ->
    JSONSchemaSequelizer.resource(@ctx, @jss.models.Test, 'edit')
      .then (result) ->
        expect(result.get().actions.Test.edit.path).toEqual '/test/:id/edit'
        done()

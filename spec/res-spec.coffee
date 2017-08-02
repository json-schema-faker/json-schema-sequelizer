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
          id:
            type: 'integer'
            primaryKey: true
          value:
            type: 'string'

    @jss.add
      $schema:
        id: 'Owner'
        type: 'object'
        properties:
          id:
            type: 'integer'
            primaryKey: true
          name: type: 'string'

    @jss.add
      $schema:
        id: 'Cart'
        properties:
          id:
            type: 'integer'
            primaryKey: true
          owner:
            $ref: 'Owner'
            belongsTo: true
          cart:
            type: 'array'
            items:
              hasMany: true
              $ref: 'virtualTestQty'

    @jss.add
      $schema:
        id: 'virtualTestQty'
        virtual: true
        properties:
          test: $ref: 'Test'
          qty: type: 'number'


    @jss.sync({ force: true })
      .then =>
        @jss.models.Test.create(value: 'foo')
      .then =>
        @jss.models.Test.create(value: 'bar')
      .then =>
        @res = JSONSchemaSequelizer.resource(@jss.refs, @jss.models.Cart)

        # required for actions
        @jss.models.Test.options.$attributes =
          findAll: [
            { prop: 'value' }
          ]

        done()

  it 'should keep references', ->
    expect(@res.options.refs.owner.rel).toEqual 'belongsTo'
    expect(@res.options.refs.owner.model).toEqual 'Owner'
    expect(@res.options.refs.owner.plural).toEqual 'Owners'
    expect(@res.options.refs.owner.singular).toEqual 'Owner'
    expect(@res.options.refs.owner.references).toEqual {
      primaryKey: { prop: 'id', type: 'integer' }
      foreignKey: { prop: 'ownerId', type: 'integer' }
    }

    expect(@res.options.refs.test.rel).toEqual 'hasOne'
    expect(@res.options.refs.test.model).toEqual 'Test'
    expect(@res.options.refs.test.plural).toEqual 'Tests'
    expect(@res.options.refs.test.singular).toEqual 'Test'
    expect(@res.options.refs.test.references).toEqual {
      primaryKey: { prop: 'id', type: 'integer' }
      foreignKey: null
    }

    expect(@res.options.refs.cart.rel).toEqual 'hasMany'
    expect(@res.options.refs.cart.model).toEqual 'virtualTestQty'
    expect(@res.options.refs.cart.plural).toEqual 'virtualTestQties'
    expect(@res.options.refs.cart.singular).toEqual 'virtualTestQty'
    expect(@res.options.refs.cart.references).toEqual {
      primaryKey: null
      foreignKey: null
    }

  # it 'responds to findAll (index)', (done) ->
  #   @res.actions.findAll()
  #   .then () => @jss.models.Test.count()
  #   .then (result) ->
  #     console.log result
  #     #expect(result[0].value).toEqual 'foo'
  #     #expect(result[1].value).toEqual 'bar'
  #     done()

  # # it 'responds to findOne (edit|show)', (done) ->
  # #   @res.actions.findOne()
  # #   .then (result) ->
  # #     expect(result.value).toEqual 'foo'
  # #     done()

  # # it 'responds to create', (done) ->
  # #   @res.actions.create(value: 'OSOM')
  # #     .then (result) ->
  # #       expect(result.value).toEqual 'OSOM'
  # #       done()

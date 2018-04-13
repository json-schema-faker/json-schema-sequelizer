JSONSchemaSequelizer = require('../lib')
t = require('./_sequelize')
jss = null

describe 'Resources', ->
  refs = [
    {
      id: 'dataTypes'
      definitions:
        primaryKey:
          allOf: [
            { type: 'integer' }
            { minimum: 1 }
            { primaryKey: true }
            { autoIncrement: true }
          ]
    }
  ]

  beforeEach (done) ->
    jss = t.setup
      dialect: 'sqlite'
      storage: ':memory:'
      define: underscored: true
    , refs, "#{__dirname}/fixtures/relations"

    jss.scan()
      .sync()
      .then done
      .catch (e) ->
        console.log 'E_MAIN', e.stack
        done()

  it 'should create data from given associations', (done) ->
    data =
      items: [{
        qty: 5
        Product:
          name: 'One'
          price: 0.99
      }, {
        qty: 4
        product_id: 1
      }]

    resource = JSONSchemaSequelizer.resource(jss.$refs, jss.models, 'Cart')

    Promise.resolve()
      .then -> jss.models.Product.create({ name: 'Test', price: 1.23 })
      .then -> resource.actions.create(data)
      .then (row) -> row.getItems()
      .then (data) ->
        fixedData = data.map (x) ->
          [x.get('name'), x.get('price'), x.CartItem.get('qty')]

        expect(fixedData).toEqual [
          ['Test', 1.23, 4]
          ['One', 0.99, 5]
        ]

        done()
      .catch (e) ->
        console.log e.stack
        done()

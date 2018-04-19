JSONSchemaSequelizer = require('../lib')
t = require('./_sequelize')

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

settings = [
  { dialect: 'sqlite', storage: ':memory:', define: underscored: true }
  { dialect: 'postgres', define: underscored: true }
]

settings.forEach (config) ->
  jss = null
  jss = t.setup config, refs, "#{__dirname}/fixtures/relations/shopping_cart"
  jss.scan()

  describe "Resources (#{config.dialect})", ->
    Cart = null

    it 'should connect and sync before proceed', (done) ->
      jss
        .sync(force: true)
        .then ->
          Cart = JSONSchemaSequelizer.resource(jss.$refs, jss.models, 'Cart')
          done()
        .catch (e) ->
          console.log 'E_MAIN', e.stack
          done()

    it 'should create data from given associations', (done) ->
      data =
        items: [{
          qty: 5

          # full-nested-create
          Product:
            name: 'One'
            price: 0.99
        }, {
          qty: 4
          product_id: 1
        }]

      Promise.resolve()
        .then -> jss.models.Product.create({ name: 'Test', price: 1.23 })
        .then -> Cart.actions.create(data)
        .then (row) -> row.getItems({ order: ['created_at'] })
        .then (data) ->
          fixedData = data.map (x) ->
            [x.get('name'), parseFloat(x.get('price')), x.CartItem.get('qty')]

          expect(fixedData).toEqual [
            ['Test', 1.23, 4]
            ['One', 0.99, 5]
          ]

          done()
        .catch (e) ->
          console.log e.stack
          done()

    it 'should update data from given associations', (done) ->
      data =
        items: [{
          qty: 2
          product_id: 1
        }, {
          Product:
            id: 2
            name: 'OSOM'
        }]

      Promise.resolve()
        .then -> jss.models.Cart.findOne()
        .then (row) -> Cart.actions.update(data, where: id: row.get('id'))
        .then (result) ->
          expect(result).toEqual [1]
          done()
        .catch (e) ->
          console.log e.stack
          done()

    it 'should findOne/All from given associations', (done) ->
      jss.models.Cart.options.$attributes =
        findOne: [
          'items.name'
          'items.price'
        ]

      Promise.resolve()
        .then -> jss.models.Cart.findOne()
        .then (row) ->
          options =
            where:
              id: row.get('id')
              items:
                qty: [2, 5]
            items:
              order: ['created_at', 'DESC']

          Cart.actions.findOne(options)
        .then (result) ->
          fixedData =
            items: result.get('items').map (x) ->
              name: x.get('name')
              price: parseFloat(x.get('price'))
              quantity: x.get('CartItem').qty

          expect(fixedData).toEqual {
            items: [
              { name: 'OSOM', price: 0.99, quantity: 5 }
              { name: 'Test', price: 1.23, quantity: 2 }
            ]
          }

          done()
        .catch (e) ->
          console.log e.stack
          done()

    it 'should destroy data from given associtations', (done) ->
      Promise.resolve()
        .then -> Cart.actions.destroy()
        .then -> Promise.all([
          jss.models.CartItem.count()
          jss.models.Cart.count()
        ])
        .then (result) ->
          expect(result).toEqual [0, 0]
          done()
        .catch (e) ->
          console.log e.stack
          done()


# FIXME: if the given item has a ref-PK, then it'll update its associated row, add otherwise
# FIXME: prove all this out with functional tests...
# UPDATE|CREATE -> {
#   id?: 1,
#   items: [
#     {
#       qty: 3,
#       created_at: '2018-04-19T07:02:52.286Z',
#       updated_at: '2018-04-19T07:04:48.614Z',
#       cart_id!: 1,
#       product_id?: 1,
#       Product: {
#         id?: 1,
#         name: 'Example',
#         price: '234'
#       }
#     },
#     {
#       qty: 99,
#       product_id: 2,
#       Product: {
#         id: 2,
#         name: 'Another',
#         price: '345'
#       }
#     }
#   ]
# }

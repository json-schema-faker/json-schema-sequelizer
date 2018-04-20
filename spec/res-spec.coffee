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

          jss.models.Cart.options.$attributes =
            findOne: [
              'items.name'
              'items.price'
            ]

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
            [x.name, parseFloat(x.price), x.CartItem.qty]

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
        }]

      Promise.resolve()
        .then -> Cart.actions.update(data, where: id: 1)
        .then (result) ->
          expect(result.id).toEqual 1
          done()
        .catch (e) ->
          console.log e.stack
          done()

    it 'should findOne/All from given associations', (done) ->
      options =
        where:
          id: 1
          items:
            qty: [2, 5]
        items:
          required: true
          order: ['created_at', 'DESC']

      Promise.resolve()
        .then -> Cart.actions.findOne(options)
        .then (result) ->
          fixedData =
            items: result.items.map (x) ->
              name: x.Product.name
              price: parseFloat(x.Product.price)
              quantity: x.qty

          expect(fixedData).toEqual {
            items: [
              { name: 'One', price: 0.99, quantity: 5 }
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
          jss.models.Product.count()
          jss.models.Cart.count()
        ])
        .then (result) ->
          expect(result).toEqual [0, 2, 0]
          done()
        .catch (e) ->
          console.log e.stack
          done()

    it 'should work under complex conditions', (done) ->
      newOrder =
        items: [
          { qty: -1, product_id: 1 }
        ]

      Product = { name: 'OK', price: 4.5 }

      updateOrder = (cartId) ->
        id: cartId
        items: [
          { qty: 0, product_id: 1 }
          { qty: 1, cart_id: cartId, product_id: 1 }
          { qty: 2, product_id: 2 }
          { qty: 3, Product }
          { qty: 4, cart_id: cartId, product_id: 2, Product }
          { qty: 5, Product: { name: 'Extra', price: 10 } }
        ]

      Promise.resolve()
        .then -> Cart.actions.create(newOrder)
        .then -> Cart.actions.findOne()
        .then (result) ->
          expect(result.items.length).toEqual 1
          Cart.actions.update(updateOrder(result.id), where: id: result.id)
        .then (row) -> row.getItems({ order: ['created_at'] })
        .then (data) ->
          fixedData = data
            .sort (a, b) ->
              return -1 if a.CartItem.qty < b.CartItem.qty
              return 1 if a.CartItem.qty > b.CartItem.qty
              0
            .map (x) ->
              [x.CartItem.qty, x.id, x.name, parseFloat(x.price)]

          expect(fixedData).toEqual [
            [ -1, 1, 'Test', 1.23 ]
            [ 0, 1, 'Test', 1.23 ]
            [ 1, 1, 'Test', 1.23 ]
            [ 3, 3, 'OK', 4.5 ]
            [ 4, 2, 'One', 0.99 ]
            [ 5, 4, 'Extra', 10 ]
          ]
        .then ->
          Promise.all [
            jss.models.CartItem.count()
            jss.models.Product.count()
          ]
        .then (result) ->
          # expect(result).toEqual [6, 4]
          done()
        .catch (e) ->
          console.log e
          done()

    it 'should close on finish', ->
      jss.close()

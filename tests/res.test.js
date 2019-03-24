const { expect } = require('chai');
const JSONSchemaSequelizer = require('../lib');
const t = require('./_sequelize');

const refs = [
  {
    id: 'dataTypes',
    definitions: {
      primaryKey: {
        allOf: [
          {
            type: 'integer',
          }, {
            minimum: 1,
          }, {
            primaryKey: true,
          }, {
            autoIncrement: true,
          },
        ],
      },
    },
  },
];

const settings = [
  {
    dialect: 'sqlite',
    storage: ':memory:',
    define: {
      underscored: true,
    },
  }, {
    dialect: 'postgres',
    define: {
      underscored: true,
    },
  },
];

/* global describe, it */

settings.forEach(config => {
  let jss = null;

  jss = t.setup(config, refs, `${__dirname}/fixtures/relations/shopping_cart`);
  jss.scan();

  describe(`Resources (${config.dialect})`, () => {
    let Cart;

    it('should connect and sync before proceed', () => {
      return jss.sync({
        force: true,
        logging: false,
      }).then(() => {
        Cart = JSONSchemaSequelizer.resource(jss, 'Cart');
        jss.models.Cart.options.$attributes = {
          findOne: ['items.name', 'items.price'],
        };
      });
    });

    it('should skip primaryKeys when unique is false', () => {
      expect(Object.keys(jss.models.CartItem.primaryKeys)).to.eql(['id']);
    });

    it('should create data from given associations', () => {
      const data = {
        items: [
          {
            qty: 5,
            Product: {
              name: 'One',
              price: 0.99,
            },
          }, {
            qty: 4,
            ProductId: 1,
          },
        ],
      };

      return Promise.resolve().then(() => {
        return jss.models.Product.create({
          name: 'Test',
          price: 1.23,
        });
      }).then(() => {
        return Cart.actions.create(data)
          .then(pk => jss.models.Cart.findByPk(pk));
      }).then(row => {
        return row.getItems({
          order: ['createdAt'],
        });
      })
        .then(result => {
          const fixedData = result.map(x => {
            return [x.name, parseFloat(x.price), x.CartItem.qty];
          });

          expect(fixedData).to.eql([['Test', 1.23, 4], ['One', 0.99, 5]]);
        });
    });

    it('should update data from given associations', () => {
      const data = {
        items: [
          {
            qty: 2,
            ProductId: 1,
          },
        ],
      };

      return Promise.resolve().then(() => {
        return Cart.actions.update(data, {
          where: {
            id: 1,
          },
        });
      }).then(pk => {
        expect(pk).to.eql(1);
      });
    });

    it('should findOne/All from given associations', () => {
      const options = {
        where: {
          id: 1,
          items: {
            qty: [2, 5],
          },
        },
        items: {
          required: true,
          order: ['createdAt', 'DESC'],
        },
      };

      return Promise.resolve().then(() => {
        return Cart.actions.findOne(options);
      }).then(result => {
        const fixedData = {
          items: result.items.map(x => {
            return {
              name: x.Product.name,
              price: parseFloat(x.Product.price),
              quantity: x.qty,
            };
          }),
        };

        expect(fixedData).to.eql({
          items: [
            {
              name: 'One',
              price: 0.99,
              quantity: 5,
            }, {
              name: 'Test',
              price: 1.23,
              quantity: 2,
            },
          ],
        });
      });
    });

    it('should destroy data from given associations', () => {
      return Promise.resolve().then(() => {
        return Cart.actions.destroy({ where: { id: 1 } });
      }).then(() => {
        return Promise.all([jss.models.CartItem.count(), jss.models.Product.count(), jss.models.Cart.count()]);
      }).then(result => {
        expect(result).to.eql([0, 2, 0]);
      });
    });

    it('should create data from nested associations ', () => {
      return Promise.resolve()
        .then(() => Cart.actions.create({
          items: [
            { qty: 2, Product: { name: 'Example', price: 0.20 } },
            { qty: 2, Product: { id: 2, name: 'One', price: 0.99 } },
            { qty: 2, Product: { id: 1, name: 'Test', price: 1.23 } },
          ],
        }))
        .then(pk => Cart.actions.findOne({ where: { id: pk } }).then(x => {
          expect((x.items.reduce((a, b) => a + (b.Product.price * b.qty), 0)).toFixed(2)).to.eql('4.84');
        }))
        .then(() => Cart.actions.count().then(x => expect(x).to.eql(1)))
        .then(() => jss.models.Product.count().then(x => expect(x).to.eql(3)))
        .then(() => jss.models.CartItem.count().then(x => expect(x).to.eql(3)));
    });

    it('should update data from nested associations ', () => {
      return Promise.resolve()
        .then(() => Cart.actions.update({
          items: [
            { id: 4, qty: 1, Product: { id: 1 } },
            { id: 5, qty: 1, Product: { id: 2 } },
          ],
        }, { where: { id: 2 } }))
        .then(pk => Cart.actions.findOne({ where: { id: pk } }).then(x => {
          expect((x.items.reduce((a, b) => a + (b.Product.price * b.qty), 0)).toFixed(2)).to.eql('2.62');
        }));
    });

    it('should update data from single associations', () => {
      const Product = JSONSchemaSequelizer.resource(jss, 'Product');

      jss.models.Product.options.$attributes = {
        findAll: ['name', 'price'],
      };

      return Promise.resolve()
        .then(() => Product.actions.update({ name: 'Two' }, { where: { name: 'One' } }))
        .then(() => Product.actions.findAll({ order: [['name', 'ASC']] })).then(x => {
          const value = x.map(y => `${y.name} $${y.price}`).join('\n');

          expect([
            'Example $0.2',
            'Test $1.23',
            'Two $0.99',
          ].join('\n')).to.eql(value);
        });
    });

    it('should close on finish', () => {
      jss.close();
    });
  });
});

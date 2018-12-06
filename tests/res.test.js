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
            product_id: 1,
          },
        ],
      };

      return Promise.resolve().then(() => {
        return jss.models.Product.create({
          name: 'Test',
          price: 1.23,
        });
      }).then(() => {
        return Cart.actions.create(data);
      }).then(row => {
        return row.getItems({
          order: ['created_at'],
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
            product_id: 1,
          },
        ],
      };

      return Promise.resolve().then(() => {
        return Cart.actions.update(data, {
          where: {
            id: 1,
          },
        });
      }).then(result => {
        expect(result.id).to.eql(1);
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
          order: ['created_at', 'DESC'],
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

    it('should destroy data from given associtations', () => {
      return Promise.resolve().then(() => {
        return Cart.actions.destroy();
      }).then(() => {
        return Promise.all([jss.models.CartItem.count(), jss.models.Product.count(), jss.models.Cart.count()]);
      }).then(result => {
        expect(result).to.eql([0, 2, 0]);
      });
    });

    it('should work under complex conditions', () => {
      const newOrder = {
        items: [
          {
            qty: -1,
            product_id: 1,
          },
        ],
      };

      const Product = {
        name: 'OK',
        price: 4.5,
      };

      const updateOrder = cartId => {
        return {
          id: cartId,
          items: [
            {
              qty: 0,
              product_id: 1,
            }, {
              qty: 1,
              cart_id: cartId,
              product_id: 1,
            }, {
              qty: 2,
              product_id: 2,
            }, {
              qty: 3,
              Product,
            }, {
              qty: 4,
              cart_id: cartId,
              product_id: 2,
              Product,
            }, {
              qty: 5,
              Product: {
                name: 'Extra',
                price: 10,
              },
            },
          ],
        };
      };

      return Promise.resolve().then(() => {
        return Cart.actions.create(newOrder);
      }).then(() => {
        return Cart.actions.findOne();
      }).then(result => {
        expect(result.items.length).to.eql(1);
        return Cart.actions.update(updateOrder(result.id), {
          where: {
            id: result.id,
          },
        });
      })
        .then(row => {
          return row.getItems({
            order: ['created_at'],
          });
        })
        .then(data => {
          const fixedData = data.sort((a, b) => {
            if (a.CartItem.qty < b.CartItem.qty) {
              return -1;
            }

            if (a.CartItem.qty > b.CartItem.qty) {
              return 1;
            }

            return 0;
          }).map(x => {
            return [x.CartItem.qty, x.id, x.name, parseFloat(x.price)];
          });

          expect(fixedData).to.eql([[1, 1, 'Test', 1.23], [1, 1, 'Test', 1.23], [3, 3, 'OK', 4.5], [4, 2, 'One', 0.99], [5, 4, 'Extra', 10]]);
        })
        .then(() => {
          return Promise.all([jss.models.CartItem.count(), jss.models.Product.count()]);
        })
        .then(result => {
          expect(result).to.eql([5, 4]);
        })
        .then(() => {
          return Cart.actions.findOne();
        })
        .then(result => {
          expect(result.items.length).to.eql(5);
        });
    });

    it('should close on finish', () => {
      jss.close();
    });
  });
});

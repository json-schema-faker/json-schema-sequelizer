const td = require('testdouble');
const { expect } = require('chai');
const JSONSchemaSequelizer = require('../lib');
const t = require('./_sequelize');

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

/* global afterEach, describe, it */

afterEach(() => {
  td.reset();
});

settings.forEach(config => {
  let jss = null;

  jss = t.setup(config, t.refs, `${__dirname}/fixtures/relations/shopping_cart`);
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
      }).catch(console.log);
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

      return Promise.resolve()
        .then(() => jss.models.Product.create({
          name: 'Test',
          price: 1.23,
        }))
        .then(() => jss.sequelize.transaction())
        .then(_t => {
          return Cart.actions.create(data, {
            transaction: config.dialect === 'sqlite' ? _t : null,
          }).then(result => _t.commit().then(() => result));
        })
        .then(([row]) => row.getItems({ order: ['createdAt'] }))
        .then(result => {
          const fixedData = result.map(x => {
            return [x.name, parseFloat(x.price), x.CartItem.qty];
          }).sort((a, b) => b[2] - a[2]);

          expect(fixedData).to.eql([['One', 0.99, 5], ['Test', 1.23, 4]]);
        });
    });

    it('should update data from given associations', () => {
      const data = {
        items: [
          {
            qty: 99,
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
      }).then(([affected]) => {
        expect(affected).to.eql(0);
        return Cart.actions.findOne({ id: 1 }).then(x => {
          expect(x.items[1].qty).to.eql(99);
        });
      });
    });

    it('should findOne/All from given associations', () => {
      const options = {
        where: {
          id: 1,
          items: {
            qty: [99, 5],
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
              quantity: 99,
            },
          ],
        });
      });
    });

    it('should destroy data from given associations', () => {
      return Promise.resolve().then(() => {
        return Cart.actions.destroy({ where: { id: 1 } });
      }).then(affected => {
        expect(affected).to.eql(1);
        return Promise.all([jss.models.CartItem.count(), jss.models.Product.count(), jss.models.Cart.count()]);
      }).then(result => {
        expect(result).to.eql([0, 2, 0]);
      });
    });

    it('should create data from nested associations', async () => {
      const [row] = await Cart.actions.create({
        items: [
          { qty: 2, Product: { name: 'Example', price: 0.20 } },
          { qty: 3, Product: { id: 2, name: 'One', price: 0.99 } },
          { qty: 4, Product: { id: 1, name: 'Test', price: 1.23 } },
        ],
      });

      expect(await Cart.actions.count()).to.eql(1);
      expect(await jss.models.Product.count()).to.eql(3);
      expect(await jss.models.CartItem.count()).to.eql(3);

      const result = await Cart.actions.findOne({ where: { id: row.id } });

      expect((result.items.reduce((a, b) => a + (b.Product.price * b.qty), 0)).toFixed(2)).to.eql('8.29');
    });

    it('should update data from nested associations', () => {
      return Promise.resolve()
        .then(() => Cart.actions.update({
          items: [
            { id: 4, qty: 1, ProductId: 1 },
            { id: 5, qty: 1, Product: { id: 2, name: 'OSOM' } },
          ],
        }, { where: { id: 2 } }))
        .then(() => Cart.actions.findOne({ where: { id: 2 } }).then(x => {
          x.items.sort((a, b) => b.ProductId - a.ProductId);
          expect((x.items.reduce((a, b) => a + (b.Product.price * b.qty), 0)).toFixed(2)).to.eql('2.62');
          expect(x.items.map(p => [p.Product.id, p.Product.name].join('.'))).to.eql(['3.Example', '2.OSOM', '1.Test']);
        }));
    });

    it('should update attachments from nested associations', async () => {
      const Attachment = JSONSchemaSequelizer.resource(jss, 'Attachment');
      const Example = JSONSchemaSequelizer.resource(jss, 'Example');
      const File = JSONSchemaSequelizer.resource(jss, 'File');

      const payload = {
        label: 'xxx',
        File: {
          kind: 'ATTACHMENT',
          name: 'brightfox_logo.png',
          type: 'image/png',
          size: 13774,
          path: 'tmp/6e13a9f4d09b7a8d03e55fe00.png',
        },
      };

      await File.actions.create(payload.File);
      await Attachment.actions.create(payload);
      await Attachment.actions.create({ label: payload.label });

      expect(await File.actions.count()).to.eql(2);
      expect(await Attachment.actions.count()).to.eql(2);
      expect(await Attachment.actions.update({ ...payload, File: { ...payload.File, id: 2 } })).to.eql([2]);
      expect(await Attachment.actions.count()).to.eql(2);

      await Example.actions.create({
        title: 'TITLE',
        fileset: [{
          ...payload.File,
          Attachment: { label: 'LABEL' },
        }],
      });

      expect(await File.actions.count()).to.eql(2);
      expect(await Attachment.actions.count()).to.eql(3);
    });

    it('should update data from single associations', () => {
      const Product = JSONSchemaSequelizer.resource(jss, 'Product');

      jss.models.Product.options.$attributes = {
        findAll: ['name', 'price'],
      };

      return Promise.resolve()
        .then(() => Product.actions.update({ name: 'Two' }, { where: { id: 2 } }))
        .then(() => Product.actions.findAll({ order: [['name', 'ASC']] }))
        .then(x => {
          const value = x.map(y => `${y.name} $${y.price}`).join('\n');

          expect([
            'Example $0.2',
            'Test $1.23',
            'Two $0.99',
          ].join('\n')).to.eql(value);
        });
    });

    it('should handle attachments through files and data-uri', () => {
      const Product = JSONSchemaSequelizer.resource(jss, {
        attachments: {
          files: {
            foo: {
              path: '/tmp/uploads/foo',
            },
            baz: [{
              path: '/tmp/uploads/buzz',
            }, {
              path: '/tmp/uploads/bazzinga',
            }],
            test: {
              path: '/tmp/uploads/h12v3gj4byg2f34',
              name: 'testing',
              type: 'any/type',
              size: 1234,
            },
          },
          baseDir: '/tmp',
          uploadDir: 'uploads',
        },
      }, 'Product');

      jss.models.Product.options.$attributes = {
        findOne: ['name', 'price', 'image.path', 'images.path', 'attachment'],
      };

      td.replace(Date, 'now');
      td.when(Date.now()).thenReturn(0);

      return Promise.resolve()
        .then(() => Product.actions.create({
          name: 'Test',
          price: 0.99,
          image: {
            kind: 'ATTACHMENT',
            $upload: 'data:mime/type;base64,x',
          },
          image2: {
            kind: 'ATTACHMENT',
            $upload: 'foo',
          },
          images: [
            { kind: 'ATTACHMENT', $upload: 'baz' },
          ],
          attachment: {
            kind: 'ATTACHMENT',
            $upload: 'test',
          },
        }))
        .then(([x, result]) => {
          expect(x.id).to.eql(result.id);
          expect(result.image.imageId).to.eql(result.id);
          expect(result.image2.image2Id).to.eql(result.id);
          expect(result.image2.path).to.eql('uploads/foo');
          expect(result.images[0].ProductId).to.eql(result.id);
          expect(result.images[1].ProductId).to.eql(result.id);
          expect(result.images[1].path).to.eql('uploads/bazzinga');
          expect(result.attachment).to.eql('url:any/type;1234,testing@uploads/h12v3gj4byg2f34');

          return Product.actions.findOne({ where: { id: x.id } }).then(sample => {
            sample = sample.toJSON();
            sample.price = parseFloat(sample.price);
            sample.images.sort((a, b) => b.id - a.id);
            expect(sample).to.eql({
              id: 4,
              name: 'Test',
              price: 0.99,
              attachment: 'url:any/type;1234,testing@uploads/h12v3gj4byg2f34',
              image: {
                ProductId: null, fileId: null, image2Id: null, imageId: 4, id: 3, path: 'uploads/0_mime.type',
              },
              images: [
                {
                  fileId: null, image2Id: null, imageId: null, ProductId: 4, id: 6, path: 'uploads/bazzinga',
                },
                {
                  fileId: null, image2Id: null, imageId: null, ProductId: 4, id: 5, path: 'uploads/buzz',
                },
              ],
            });
          });
        });
    });

    it('should handle attachments from nested associations', () => {
      const Product = JSONSchemaSequelizer.resource(jss, 'Product');

      Cart = JSONSchemaSequelizer.resource(jss, {
        attachments: {
          files: {
            ok: {
              path: '/tmp/uploads/bar',
            },
            not: [{
              path: '/tmp/uploads/buah',
            }],
            test: {
              path: '/tmp/uploads/OSOM',
            },
          },
          baseDir: '/tmp',
          uploadDir: 'uploads',
        },
      }, 'Cart');

      jss.models.Product.options.$attributes = {
        findOne: ['name', 'price', 'image.path', 'images.path'],
      };

      jss.models.Cart.options.$attributes = {
        findOne: ['items.name', 'items.price', 'items.image.path', 'items.images.path'],
      };

      return Promise.resolve()
        .then(() => Cart.actions.create({
          items: [
            {
              qty: 3,
              Product: {
                name: 'Test',
                price: 0.99,
                image: { $upload: 'ok', kind: 'DOWNLOAD' },
                images: [{ $upload: 'not', kind: 'ATTACHMENT' }, { $upload: 'test', kind: 'BACKUP' }],
              },
            },
          ],
        }))
        .then(([row]) => Cart.actions.findOne({ where: { id: row.id } }))
        .then(result => {
          expect(result.items[0].Product.image.path).to.eql('uploads/bar');
          expect(result.items[0].Product.images.length).to.eql(2);
          return Product.actions.findOne({ where: { id: result.items[0].ProductId } })
            .then(data => {
              data.images.sort((a, b) => a.id - b.id);
              expect(data.image.path).to.eql('uploads/bar');
              expect(data.images[0].path).to.eql('uploads/buah');
              expect(data.images[1].path).to.eql('uploads/OSOM');
            });
        })
        .then(() => Cart.actions.update({
          items: [
            {
              id: 6,
              qty: 3,
              Product: {
                id: 5,
                name: 'OSOM',
                image: { id: 7, path: 'OK' },
                images: [{ id: 8, path: 'WUT' }, { $upload: 'ok', path: 'OTHER', kind: 'BACKUP' }],
              },
            },
          ],
        }, { where: { id: 3 } }))
        .then(() => Cart.actions.findOne({ where: { id: 3 } }).then(result => {
          expect(result.items[0].qty).to.eql(3);
          expect(result.items[0].Product.name).to.eql('OSOM');
          expect(result.items[0].Product.image.path).to.eql('OK');
          expect(result.items[0].Product.images.length).to.eql(3);
          return Product.actions.findOne({ where: { id: 5 } }).then(data => {
            data.images.sort((a, b) => a.id - b.id);
            expect(data.image.path).to.eql('OK');
            expect(data.images[0].path).to.eql('WUT');
            expect(data.images[1].path).to.eql('uploads/OSOM');
            expect(data.images[2].path).to.eql('OTHER');
          });
        }));
    });

    it('should process uploads from associated models', () => {
      const Attachment = JSONSchemaSequelizer.resource(jss, {
        attachments: {
          files: {
            ok: {
              path: '/tmp/uploads/bar',
            },
          },
          baseDir: '/tmp',
          uploadDir: 'uploads',
        },
      }, 'Attachment');

      return Promise.resolve()
        .then(() => Attachment.actions.create({
          label: 'test',
          File: { $upload: 'ok', kind: 'BACKUP' },
        })).then(([, result]) => {
          expect(result).to.eql({ label: 'test', FileId: 11, id: 4 });
        });
    });

    it('should close on finish', () => {
      jss.close();
    });
  });
});

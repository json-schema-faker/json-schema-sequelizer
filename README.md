# JSON-Schema Sequelizer

[![travis-ci](https://api.travis-ci.org/pateketrueke/json-schema-sequelizer.svg)](https://travis-ci.org/pateketrueke/json-schema-sequelizer) [![codecov](https://codecov.io/gh/pateketrueke/json-schema-sequelizer/branch/master/graph/badge.svg)](https://codecov.io/gh/pateketrueke/json-schema-sequelizer)

Declare your Sequelize models using JSON-Schema today!

```bash
$ npm i json-schema-sequelizer --save
```

_This is a **work in progress**, any feedback is very welcome!_

## Features

- Model definitions are JSON-Schema
- Associations are made from `$ref`s
- Migrations generator/runner
- Abstract CRUD builder

## Setup

```js
const JSONSchemaSequelizer = require('json-schema-sequelizer');

// connection settings for Sequelize
const settings = {
  dialect: 'sqlite',
  storage: ':memory:',
};

// external references (not models)
// can be an array or object
const definitions = {
  dataTypes: {
    definitions: {
      PK: {
        type: 'integer',
        minimum: 1,
        primaryKey: true,
        autoIncrement: true,
      },
    },
  },
};

// resolve local references from this directory
const builder = new JSONSchemaSequelizer(settings, definitions, process.cwd());
```

## Definition

```js
// add a dummy model
builder.add({
  // the $schema object is required at top-level
  $schema: {
    // model options placed here can be persisted
    options: {
      paranoid: true,
      timestamps: false,
    },

    // the $schema.id is required (don't forget it!)
    id: 'Tag',

    // model fields
    properties: {
      // resolved from an external/local reference (see below)
      id: {
        $ref: 'dataTypes#/definitions/PK',
      },

      // regular fields
      name: {
        type: 'string',
      },

      // ID-references are used for associating things
      children: {
        items: {
          $ref: 'Tag',
        },
      },
    },
    required: ['id', 'name'],
  },
  // any other property will be used as the model definition
  hooks: {},
  getterMethods: {},
  setterMethods: {},
  classMethods: {},
  instanceMethods: {},
  // etc.
});
```

## Basic usage

```js
builder.connect()
  .then(() => builder.models.Tag.sync())
  .then(() => {
    // create a Tag with some children
    return builder.models.Tag.create({
      name: 'Root',
      children: [
        { name: 'Leaf' },
      ],
    }, {
      // associations are set explicitly
      include: [builder.models.Tag.associations.children]
    });
  })
  .then(tag => {
    console.log(tag.id); // 1
    console.log(tag.name); // Root
    console.log(tag.children[0].id); // 2
    console.log(tag.children[0].name); // Leaf
  })
```

## Migrations

### Snapshots

```js
  .then(() => {
    // built-in schemas from given models, e.g.
    const set = Object.keys(builder.models).map(m => builder.refs[m].$schema);

    // dump current schema
    const bundle = JSONSchemaSequelizer.bundle(set, definitions, 'Latest changes!');

    // save all schemas as single JSON-Schema
    require('fs').writeFileSync('current_schema.json', JSON.stringify(bundle, null, 2));

    // migrating from snapshots is easy
    return builder.rehydrate(bundle);
  })
```

### Generating code

```js
  .then(() => {
    // if true, all up/down/change calls will be merged
    const squashMigrations = true;

    // any diff from here will generate its migration code
    const previousBundle = {};

    // dump migration code
    return JSONSchemaSequelizer.generate(previousBundle, builder.models, squashMigrations)
      .then(result => {
        // save as module
        require('fs').writeFileSync('current_schema.js', result.code);

        // when saving migrations to disk, you can load them later
        // by instantiating a custom `umzug` wrapper
        const wrapper = JSONSchemaSequelizer.migrate(settings, {
          configFile: 'db/migrations.json',
          baseDir: 'db/migrations',
          logger(message) {
            console.log(message);
          },
        });

        return wrapper.up().then(() => {
          console.log('Done!');
        });
      });
  })
```

### Migrating from code

```js
  .then(() => {
    // if true, will bind the given arguments for run as migrations,
    // otherwise it will instantiate a `umzg` wrapper (see above)
    const bindMethods = true;

    // this can be a module, or json-object
    const options = require('./current_schema');

    // execute migration from code
    return JSONSchemaSequelizer
      .migrate(builder.sequelize, options, bindMethods)
      .up();
  })
```

## Faking data

```js
  .then(() => {
    // just prefix your calls and voila
    return builder.models.Tag
      .faked.findOne().then(result => {
        console.log(JSON.stringify(result, null, 2));
      });
  })
/*
{
  "id": -80610000,
  "name": "aute labore",
  "children": [
    {
      "id": -7795084,
      "name": "esse"
    },
    {
      "id": 99346362,
      "name": "quis esse",
      "children": [
        {
          "id": -90816751,
          "name": "do Lorem ea pariatur dolor"
        },
        {
          "id": -18992291,
          "name": "in sunt"
        },
        {
          "id": -12809524,
          "name": "in velit Duis",
          "children": [
            {
              "id": -74337843,
              "name": "in"
            }
          ]
        },
        {
          "id": 79733248,
          "name": "aliquip non consectetur adipisicing",
          "children": [
            {
              "id": -51084768,
              "name": "cillum ve"
            },
            {
              "id": 56603940,
              "name": "mollit do adipisicing velit dolore"
            }
          ]
        },
        {
          "id": 28572807,
          "name": "velit dolor laboris"
        }
      ]
    }
  ]
}
*/
```

## Resources

```js
  .then(() => {
    // prepare the resource handler
    const res = JSONSchemaSequelizer.resource(builder.models.Tag);

    // resource details, references and UI
    console.log(JSON.stringify(res.options, null, 2));
    /*
    {
      "ref": {
        "primaryKey": "id",
        "singular": "Tag",
        "plural": "Tags",
        "model": "Tag"
      },
      "refs": {
        "children": {
          "type": "HasMany",
          "model": "Tag",
          "plural": "Tags",
          "singular": "Tag",
          "foreignKey": "TagId",
          "primaryKey": "id"
        }
      },
      "schema": {
        "properties": {
          "id": {
            "type": "integer",
            "minimum": 1
          },
          "name": {
            "type": "string"
          },
          "children": {
            "items": {
              "$ref": "Tag"
            }
          }
        },
        "required": [
          "id",
          "name"
        ]
      },
      "uiSchema": {},
      "uiFields": {}
    }
    */

    // try several actions in order
    return Promise.resolve()
      .then(() => {
        // associations are automatic
        return res.actions.create({
          name: 'Root',
          children: [
            { name: 'Leaf A' },
            { name: 'Leaf B' },
          ],
        })
        .then(result => {
          console.log(result.id); // 3
          console.log(result.name); // Root
          console.log(result.children[0].id); // 4
          console.log(result.children[0].name); // Leaf A
          console.log(result.children[1].name); // Leaf B
        });
      })
      .then(() => {
        return res.actions.update({
          name: 'Roots',
          children: [
            { name: 'Leaf X', id: 4 },
          ],
        }, { id: 3 });
      })
      .then(() => {
        // attribute filters are taken from uiFields
        builder.models.Tag.options.$uiFields = {
          findOne: [
            { prop: 'name' },
            { prop: 'children.name' },
          ],
        };

        return res.actions.findOne({
          id: 3,
        }).then(result => {
          console.log(result.name); // Roots
          console.log(result.children[0].name); // Leaf X
          console.log(result.children[1].name); // Leaf B
        });
      });
  })
```

## CRUD example

```js
  .then(() => {
    // instantiate a plain http-server
    require('http').createServer((req, res) => {
      // extract the params from the given URL, e.g. /Model/ID
      const parts = req.url.split('?')[0].split('/');
      const model = parts[1];
      const param = parts[2];

      // finalize the request as JSON
      function end(result, headers) {
        let status = 200;

        if (typeof result === 'number') {
          status = result;
          result = arguments[1];
          headers = arguments[2];
        }

        res.writeHead(status, {
          'Content-Type': 'application/json',
        });

        res.end(JSON.stringify(result));
      }

      // no given model, return resource list
      if (!model) {
        end({
          resources: Object.keys(builder.models),
        });
        return;
      }

      // resource handler and options
      const obj = JSONSchemaSequelizer.resource(builder.models[model]);

      // filters for the current resource
      const where = {
        [obj.options.ref.primaryKey]: param,
      };

      // model found
      if (builder.models[model]) {
        // write operations
        if (req.method === 'POST') {
          let data = '';

          // try to read input as JSON
          req.setEncoding('utf8');
          req.on('data', chunk => {
            data += chunk;
          });

          req.on('end', () => {
            try {
              const payload = JSON.parse(data);

              if (param) {
                obj.actions.update(payload, where).then(end);
              } else {
                obj.actions.create(payload).then(end);
              }
            } catch (e) {
              end(400, { error: e.message });
            }
          });
        } else if (param) {
          // found params, read/destroy
          if (req.method === 'DELETE') {
            obj.actions.destroy(where).then(end);
          } else {
            obj.actions.findOne(where).then(end);
          }
        } else {
          // return resource options
          end(obj.options);
        }
      } else {
        // unknown resource
        end(400, { error: 'unknown' });
      }
    })
    .listen(8080);

    console.log('Server running at http://localhost:8080/');

    // try `curl -H "Content-Type: application/json" -X POST -d '{"name":"TEST"}' http://localhost:8080/Tag/1`
    // and then `curl http://localhost:8080/Tag/1`
  })
  .catch(e => {
    console.log(e.stack);
  });
```


## Associations

Relationships between models are declared with references:

- `hasOne` &larr; `{ x: { $ref: 'Model' } }`
- `hasMany` &larr; `{ x: { items: { $ref: 'Model' } } }`
- `belongsTo` &larr; `{ x: { $ref: 'Model', belongsTo: true } }`
- `belongsToMany` &larr; `{ x: { items: { $ref: 'Model', belongsToMany: true } } }`

Additionally you can pass an object to provide options to the association, e.g.

```js
{
  $schema: {
    id: 'Post',
    properties: {
      tags: {
        items: {
          $ref: 'Tag',
          belongsToMany: {
            through: 'PostTags',
          },
        },
      },
    },
  },
}
```

E.g., if you've defined `PostTags` it will be used instead, otherwise the options are passed as is to Sequelize (which in turn can create the intermediate table as well).

## Options

- `settings`
&mdash;

- `refs`
&mdash;

- `cwd`
&mdash;

## Instance properties

- `sequelize`
&mdash;

- `models`
&mdash;

- `refs`
&mdash;

## Instance methods

- `add(definition)`
&mdash;

- `scan(callback)`
&mdash;

- `sync(options)`
&mdash;

- `close()`
 &mdash;

- `connect()`
&mdash;

- `hydrate(bundle)`
 &mdash;

- `rehydrate(dump)`
&mdash;

## Static methods

- `bundle(schemas, definitions, description)`
  &mdash;

- `generate(dump, models, definitions, squashMigrations)`
  &mdash;

- `resource(ctx, model, action)`
&mdash;

- `migrate(sequelize, options, bind)`
&mdash;

- `async(models, options)`
&mdash;

- `clear(models, options)`
&mdash;

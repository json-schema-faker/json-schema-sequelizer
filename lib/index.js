'use strict';

/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */

let Sequelize;

const $RefParser = require('json-schema-ref-parser');

const _util = require('util');
const glob = require('glob');
const path = require('path');
const fs = require('fs-extra');

// load after sequelize
const util = require('./util');
const diff = require('./diff');

const AUTOLOAD = {
  'attributes.json': '$attributes',
  'uiSchema.json': '$uiSchema',
  'hooks.js': 'hooks',
  'methods.js': 'classMethods',
  'getters.js': 'getterMethods',
  'setters.js': 'setterMethods',
  'instance.js': 'instanceMethods',
};

function JSONSchemaSequelizer(settings, refs, cwd) {
  if (typeof settings === 'string') {
    settings = {
      connection: settings,
    };
  }

  settings = settings || {};

  // disabled by default
  settings.operatorsAliases = typeof settings.operatorsAliases !== 'undefined'
    ? settings.operatorsAliases
    : false;

  /* istanbul ignore else */
  if (!(this instanceof JSONSchemaSequelizer)) {
    return new JSONSchemaSequelizer(settings, refs, cwd);
  }

  /* istanbul ignore else */
  if (typeof refs === 'string') {
    cwd = refs;
    refs = {};
  }

  // normalize basedir
  cwd = `${(cwd || process.cwd()).replace(/\/+$/, '')}/`;

  // store given refs
  const _defns = {};

  /* istanbul ignore else */
  if (Array.isArray(refs)) {
    refs.forEach($schema => {
      _defns[$schema.id] = { $schema };
    });
  } else {
    Object.keys(refs || {}).forEach(k => {
      _defns[refs[k].id || k] = { $schema: refs[k] };
    });
  }

  // identical setup as json-schema-faker
  const fixedRefs = {
    order: 1,
    canRead: true,
    read: (file, callback) => {
      const rel = path.relative(cwd, file.url);
      const schema = _defns[file.url] || _defns[rel];

      if (!schema) {
        callback(new Error(`Missing '${rel}' definition (${file.url})`));
      } else {
        callback(null, util.copy(schema.$schema));
      }
    },
  };

  const fixedOpts = {
    resolve: { fixedRefs },
    dereference: {
      circular: 'ignore',
    },
  };

  // shared connection
  let conn;

  // export connection
  Object.defineProperty(this, 'sequelize', {
    configurable: false,
    enumerable: true,
    get: () => {
      Sequelize = Sequelize || require('sequelize');

      conn = conn || (typeof settings.connection === 'string'
        ? new Sequelize(settings.connection, settings)
        : new Sequelize(settings));

      return conn;
    },
  });

  // export models
  Object.defineProperty(this, 'models', {
    configurable: false,
    enumerable: true,
    get: () => {
      /* istanbul ignore else */
      if (!conn) {
        throw new Error('Missing connection');
      }

      return conn.models;
    },
  });

  // export refs
  Object.defineProperty(this, '$refs', {
    configurable: false,
    enumerable: true,
    get: () => _defns,
  });

  // append model from settings
  this.add = model => {
    /* istanbul ignore else */
    if (!(model.$schema && model.$schema.id)) {
      throw new Error(`Missing $schema and/or id, given '${_util.inspect(model)}'`);
    }

    if (!_defns[model.$schema.id]) {
      _defns[model.$schema.id] = model;
    } else {
      Object.keys(model).forEach(key => {
        /* istanbul ignore else */
        if (!_defns[model.$schema.id][key]) {
          _defns[model.$schema.id][key] = {};
        }

        util.merge(_defns[model.$schema.id][key], model[key]);
      });
    }

    return this;
  };

  // append model from filesystem
  this.scan = cb => {
    JSONSchemaSequelizer.scan(cwd, cb)
      .forEach(model => {
        this.add(model);
      });

    return this;
  };

  this.refs = (_cwd, prefix) => {
    JSONSchemaSequelizer.refs(_cwd || cwd, prefix)
      .forEach(schema => {
        _defns[schema.id] = { $schema: schema };
      });
  };

  // synchronize models
  this.sync = opts =>
    this.connect()
      .then(() => conn.sync(opts))
      .then(() => this);

  // close connection
  this.close = () =>
    Promise.resolve()
      .then(() => conn && conn.close())
      .then(() => { conn = undefined; })
      .then(() => this);

  // initialize refs (private)
  function hydrate(bundle) {
    const _models = {};
    const _tasks = [];

    Object.keys(bundle).forEach(ref => {
      /* istanbul ignore else */
      if (bundle[ref].properties || bundle[ref].type) {
        _models[ref] = util.makeModel(ref, conn, _defns, bundle);

        // override instance $schema
        _models[ref].model.options.$schema = bundle[ref];
        _defns[ref].$dependencies = _models[ref].refs;

        _tasks.push(() => {
          const fields = _models[ref].model.options.$schema.properties || {};
          const attrs = _models[ref].model.attributes;

          // keep model references
          _defns[ref].$references = {
            primaryKeys: Object.keys(attrs)
              .filter(x => attrs[x].primaryKey || attrs[x].references)
              .map(k => {
                return {
                  prop: k,
                  type: fields[k]
                    ? fields[k].type
                    : 'integer',
                };
              }),
          };
        });
      }
    });

    // apply relationships
    util.makeRefs(_models, _defns, conn);

    _tasks.forEach(run => {
      run();
    });
  }

  // add connection to pool
  this.connect = () => {
    /* istanbul ignore else */
    if (typeof conn !== 'undefined') {
      /* istanbul ignore else */
      if (conn === null) {
        return new Promise(next => setTimeout(next, 100)).then(() => this.connect());
      }

      if (conn._resolved) {
        return Promise.resolve(this);
      }
    }

    conn = conn || null;

    return Promise.resolve()
      .then(() => {
        conn = this.sequelize;
        conn._resolved = true;

        const _refs = Object.keys(_defns).reduce((prev, cur) => {
          /* istanbul ignore else */
          if (_defns[cur].$schema) {
            prev[cur] = util.copy(_defns[cur].$schema);
          }

          return prev;
        }, {});

        return new $RefParser()
          .dereference(cwd, _refs, fixedOpts)
          .then(hydrate);
      })
      .then(() => this);
  };

  // RESTful helper
  this.resource = (options, modelName) => {
    return JSONSchemaSequelizer.resource(this.$refs, this.models, options, modelName);
  };

  // migration helper
  this.rehydrate = dump =>
    this.connect()
      .then(() => {
        if (!(dump && dump.definitions)) {
          throw new Error('Missing definitions to rehydrate');
        }

        Object.keys(dump.definitions).forEach(def => {
          /* istanbul ignore else */
          if (dump.definitions[def].properties) {
            dump.definitions[def].id = def;
          }
        });

        return new $RefParser()
          .dereference(cwd, dump, {
            dereference: {
              circular: 'ignore',
            },
          })
          .then(_bundle => hydrate(_bundle.definitions));
      })
      .then(() => this);
}

// model-deps bundler
JSONSchemaSequelizer.bundle = (schemas, definitions, description) => {
  /* istanbul ignore else */
  if (typeof definitions === 'string') {
    description = definitions;
    definitions = {};
  }

  const dump = {
    description: description || 'latest',
    definitions: {},
  };

  dump.description += ` (${new Date().toISOString()})`;

  Object.keys(definitions || {}).forEach(def => {
    dump.definitions[def] = definitions[def].definitions
      || util.fixRefs(util.copy(definitions[def]));

    // cleanup
    delete dump.definitions[def].id;
  });

  schemas.forEach(x => {
    dump.definitions[x.id] = util.fixRefs(x);
  });

  return dump;
};

// build code for migrations
JSONSchemaSequelizer.generate = (dump, models, squash, globalOptions) => {
  if (dump && dump.definitions) {
    Object.keys(dump.definitions).forEach(def => {
      /* istanbul ignore else */
      if (!dump.definitions[def].id) {
        dump.definitions[def].id = def;
      }
    });
  }

  return Promise.resolve()
    .then(() => new $RefParser()
      .dereference(dump || {}, {
        dereference: {
          circular: 'ignore',
        },
      }))
    .then(_bundle => {
      const _defns = _bundle.definitions || {};
      const _result = squash ? {} : [];

      const fixedDeps = {};

      models.forEach(m => {
        if (!m.virtual) {
          fixedDeps[m.name] = m;
        }
      });

      const _changed = [];

      return util
        .sortModels(models)
        .reduce((prev, cur) =>
          prev.then(() => {
            const ref = cur.options.$schema.id;

            if (!fixedDeps[ref]) {
              return;
            }

            const a = util.fixRefs(_defns[ref] || {}, true);
            const b = util.fixRefs(cur.options.$schema, true);

            const code = diff.build(ref, fixedDeps, a, b, diff.map(a, b), squash, globalOptions);

            if (Object.prototype.toString.call(code) === '[object Object]') {
              Object.keys(code).forEach(key => {
                if (Array.isArray(code[key])) {
                  _result[key] = _result[key] || [];

                  if (code[key].length) {
                    Array.prototype.push.apply(_result[key], code[key]);
                  }
                }
              });

              if (code.up.length + code.down.length + code.change.length) {
                _changed.push(code.reference);
              }
              return;
            }

            /* istanbul ignore else */
            if (code) {
              _result.push({ code, model: cur });
            }
          }), Promise.resolve())
        .then(() => {
          /* istanbul ignore else */
          if (squash) {
            return {
              code: [
                "/* eslint-disable */\n'use strict';\nmodule.exports = {",
                _result.up && _result.up.length
                  ? `\n  up: (queryInterface, dataTypes) => [\n${_result.up.length ? `${_result.up.join('\n')}\n` : ''}  ],`
                  : '',
                _result.down && _result.down.length
                  ? `\n  down: (queryInterface, dataTypes) => [\n${
                    _result.down.length
                      ? `${_result.down.reverse().join('\n')}\n`
                      : ''}  ],`
                  : '',
                _result.change && _result.change.length
                  ? `\n  change: (queryInterface, dataTypes) => [\n${_result.change.length ? `${_result.change.join('\n')}\n` : ''}  ],`
                  : '',
                '\n};\n',
              ].join(''),
              models: Object.keys(fixedDeps),
              changed: _changed,
            };
          }

          return _result;
        });
    });
};

// abstract crud-builder
JSONSchemaSequelizer.resource = require('./res');

// migration helpers
JSONSchemaSequelizer.migrate = require('./umzug');

// common tasks
JSONSchemaSequelizer.scan = (cwd, cb) => {
  const _models = [];

  glob.sync('**/schema.json', { cwd, nodir: true }).forEach(model => {
    const modelName = path.dirname(model);

    let modelDefinition = {
      $schema: require(path.join(cwd, model)),
    };

    /* istanbul ignore else */
    if (!modelDefinition.$schema) {
      throw new Error(`Missing $schema for '${modelName}' model`);
    }

    Object.keys(AUTOLOAD).forEach(src => {
      const def = path.join(cwd, modelName, src);

      /* istanbul ignore else */
      if (fs.existsSync(def)) {
        modelDefinition[AUTOLOAD[src]] = require(def);
      }
    });

    // unwrap definition
    modelDefinition = typeof cb === 'function'
      ? cb(modelDefinition, modelName.replace(/\/+/g, ''), Sequelize)
      : modelDefinition;

    /* istanbul ignore else */
    if (!modelDefinition.$schema.id) {
      modelDefinition.$schema.id = modelName.replace(/\/+/g, '');
    }

    /* istanbul ignore else */
    if (!modelDefinition.$schema.type) {
      modelDefinition.$schema.type = 'object';
    }

    _models.push(modelDefinition);
  });

  return _models;
};

JSONSchemaSequelizer.refs = (cwd, prefix) => {
  const _schemas = [];
  const _prefix = prefix !== false
    ? (prefix || 'definitions')
    : '';

  glob.sync(path.join('**', _prefix, '*.json'), { cwd }).forEach(json => {
    /* istanbul ignore else */
    if (json.indexOf('schema.json') === -1) {
      const schema = fs.readJsonSync(path.join(cwd, json));

      /* istanbul ignore else */
      if (!schema.id) {
        schema.id = path.basename(json, '.json');
      }

      _schemas.push(schema);
    }
  });

  return _schemas;
};

JSONSchemaSequelizer.sync = (deps, params) =>
  util
    .sortModels(deps)
    .reduce((prev, cur) =>
      prev.then(() => typeof cur.sync === 'function' && cur.sync(params))
      , Promise.resolve());

JSONSchemaSequelizer.clear = (deps, params) =>
  Promise.all(deps.map(model => model.destroy({
    truncate: params && params.truncate === true,
    where: params && Object.keys(params.where || {}).length
      ? params.where
      : null,
  })));

module.exports = JSONSchemaSequelizer;

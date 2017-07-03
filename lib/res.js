'use strict';

const debug = require('debug')('json-schema-sequelizer');

const util = require('./util');

const ACTIONS = {
  index: '',
  new: 'new',
  edit: 'edit',
  show: 'show',
  create: 'create',
  update: 'update',
  delete: 'destroy',
};

function _fixParams(schema, data, props) {
  /* istanbul ignore else */
  if (!(schema && schema.properties)) {
    throw new Error(`Missing properties for ${JSON.stringify(schema)}`);
  }

  Object.keys(schema.properties).forEach(prop => {
    /* istanbul ignore else */
    if (props[prop] && props[prop].type === 'BelongsTo') {
      const copy = data[prop] ? data[prop][props[prop].primaryKey] : null;
      const fk = props[prop].foreignKey;

      delete data[prop];

      data[fk] = copy;
    }
  });

  return data;
}

function mix(s, t) {
  /* istanbul ignore else */
  if (s) {
    Object.keys(s).forEach(k => {
      if (!t[k]) {
        t[k] = s[k];
      } else {
        t[k] = mix(s[k], t[k] || {});
      }
    });
  }

  return t;
}

function pack(action, model, obj) {
  /* istanbul ignore else */
  if (obj.attributes.indexOf(model.primaryKeyAttribute) === -1) {
    obj.attributes.unshift(model.primaryKeyAttribute);
  }

  Object.keys(obj).forEach(key => {
    /* istanbul ignore else */
    if (!Array.isArray(obj[key]) && typeof obj[key] === 'object' && obj[key] !== null && model.associations[key]) {
      const target = model.associations[key].target;
      const props = pack(action, target, obj[key]);

      switch (action) {
        case 'index':
        case 'edit':
        case 'show':
          /* istanbul ignore else */
          if (props.attributes.indexOf(target.primaryKeyAttribute) === -1) {
            props.attributes.unshift(target.primaryKeyAttribute);
          }

          props.model = target;
          props.as = key;

          obj.include.push(props);
          break;

        default:
          obj.include.push(model.associations[key]);
          break;
      }

      delete obj[key];
    }
  });

  return obj;
}

function _getOpts(model, action, params) {
  /* istanbul ignore else */
  if (action === 'update' || action === 'create' || action === 'destroy') {
    // write operations works better with all-nested
    return mix(params, {
      include: [
        {
          all: true,
          nested: true,
        },
      ],
    });
  }

  const fields = model.options.$uiFields || {};
  const props = fields[action]
    || fields.index
    || [];

  const obj = {
    include: [],
    attributes: [],
  };

  /* istanbul ignore else */
  if (model.options.defaultScope && Array.isArray(model.options.defaultScope.attributes)) {
    obj.attributes = model.options.defaultScope.attributes.slice();
  }

  props.forEach(x => {
    const key = typeof x === 'object' ? x.prop : x;

    if (key.indexOf('.') === -1) {
      obj.attributes.push(key);
    } else {
      const keys = key.split('.');

      let u = obj;
      let k;

      while (keys.length > 1) {
        k = keys.shift();

        /* istanbul ignore else */
        if (!u[k]) {
          u[k] = {
            include: [],
            attributes: [],
          };
        }

        u = u[k];
      }

      u.attributes.push(keys[0]);
    }
  });

  return pack(action, model, mix(params, obj));
}

function add(name, routes, actions) {
  /* istanbul ignore else */
  if (!routes) {
    throw new Error(`Missing routes for ${name}`);
  }

  actions[name] = {};

  Object.keys(ACTIONS).forEach(key => {
    actions[name][key] = {
      url: ACTIONS[key] && routes[ACTIONS[key]]
        ? routes[ACTIONS[key] || key].url
        : routes.url,
      path: ACTIONS[key] && routes[ACTIONS[key]]
        ? routes[ACTIONS[key] || key].path
        : routes.path,
      method: ACTIONS[key] && routes[ACTIONS[key]]
        ? routes[ACTIONS[key] || key].verb
        : routes.verb,
    };
  });
}

function push(model, seen, cb) {
  /* istanbul ignore else */
  if (seen.indexOf(model) > -1) {
    return;
  }

  seen.push(model);

  Object.keys(model.associations).map(key => model.associations[key].target)
    .forEach(m => {
      // FIXME: deep deps?
      // push(m, seen, cb);
      cb(m);
    });
}

module.exports = (ctx, model, action) => {
  /* istanbul ignore else */
  if (!(ctx.routes && ctx.params && ctx.resources)) {
    throw new Error(`Missing context object, given: ${JSON.stringify(ctx)}`);
  }

  /* istanbul ignore else */
  if (typeof model.name !== 'string') {
    throw new Error(`Expecting sequelize model, given '${model}'`);
  }

  /* istanbul ignore else */
  if (!ctx.resources[model.name]) {
    throw new Error(`Missing ${model.name} resource`);
  }

  const _where = {};
  const _props = {};
  const _model = [];

  // FIXME: exports useful props somewhere...
  // ctx.params.id can be anything?
  if (ctx.params.id) {
    _where[model.primaryKeyAttribute] = ctx.params.id;
  }

  if (ctx.params.where) {
    const p = ctx.params.where.split(';');

    p.forEach(v => {
      _where[v.split(':')[0]] = v.split(':')[1];
    });
  }

  Object.keys(model.associations)
    .forEach(ref => {
      _props[ref] = {
        type: model.associations[ref].associationType,
        model: model.associations[ref].target.name,
        plural: model.associations[ref].target.options.name.plural,
        singular: model.associations[ref].target.options.name.singular,
        foreignKey: model.associations[ref].foreignKey,
        primaryKey: model.associations[ref].target.primaryKeyAttribute,
      };

      _model.push(model.associations[ref].target);
    });

  // shared resource
  const resource = {};

  return Promise.resolve()
    .then(() => {
      debug('%s -> %s', model.name, action);

      // FIXME: how-to fake?
      switch (action) {
        case 'index':
          return model.findAll(_getOpts(model, action, { where: _where }))
            .then(data => {
              debug('Data found (%s row%s)', data.length, data.length === 1 ? '' : 's');

              resource.data = data;
            });

        case 'new':
          resource.isNew = true;
          break;

        case 'show':
        case 'edit':
          return model.findOne(_getOpts(model, action, { where: _where }))
            .then(data => {
              /* istanbul ignore else */
              if (!data) {
                debug('Row not found');

                throw new Error('Row not found');
              }

              debug('Row found');

              resource.data = data;
            });

        case 'update':
          debug('Updating resource %s', JSON.stringify(_where));

          return Promise.resolve()
            .then(() => {
              const payload = _fixParams(model.options.$schema, ctx.params.payload, _props);

              return Promise.resolve()
                .then(() => {
                  const tasks = [];

                  Object.keys(_props).forEach(key => {
                    const data = !Array.isArray(payload[key])
                      ? [payload[key]]
                      : payload[key];

                    delete payload[key];

                    data.forEach(child => {
                      // FIXME: use proper array/object values
                      if (!child || !Object.keys(child).length) {
                        return;
                      }

                      child[_props[key].foreignKey] = ctx.params.id;

                      if (!child[_props[key].primaryKey]) {
                        tasks.push(() =>
                          model.associations[key].target.create(child));
                      } else {
                        const _sub = {};

                        _sub[_props[key].primaryKey] = child[_props[key].primaryKey];

                        tasks.push(() =>
                          model.associations[key].target.update(child, { where: _sub }));
                      }
                    });
                  });

                  return Promise.all(tasks.map(cb => cb()));
                })
                .then(() => model.update(payload, _getOpts(model, action, { where: _where })));
            })
            .then(modified => ({ modified }));

        case 'create':
          debug('Creating resource with [%s]',
            Object.keys(ctx.params.payload)
              .map(x => (ctx.params.payload[x] !== null
                && typeof ctx.params.payload[x] === 'object' ? `@${x}` : x)).join(', '));

          return model.create(_fixParams(model.options.$schema, ctx.params.payload, _props), _getOpts(model, action));

        case 'destroy':
          debug('Destroying resource', JSON.stringify(_where));

          return model.destroy(_getOpts(model, action, { where: _where }));

        default:
          throw new Error(`Unsupported action ${action}`);
      }
    })
    .catch(error => {
      // capture'em all!
      resource.failure = error.message;
      return null;
    })
    .then(result => {
      // pass given result
      resource.result = result;
    })
    .then(() => ({
      failure: resource.failure,
      result: resource.result,
      isNew: resource.isNew,
      data: resource.data,
      get() {
        const _actions = {};
        const _seen = [];

        add(model.name, ctx.routes(ctx.resources[model.name].controller), _actions);

        push(model, _seen, m => {
          /* istanbul ignore else */
          if (!ctx.resources[m.name]) {
            throw new Error(`Missing ${m.name} resource`);
          }

          add(m.name, ctx.routes(ctx.resources[m.name].controller), _actions);
        });

        const schema = model.options.$schema || {};
        const uiSchema = model.options.$uiSchema || {};
        const uiFields = model.options.$uiFields || {};

        _model.forEach(ref => {
          /* istanbul ignore else */
          if (typeof uiSchema[ref.name] === 'undefined') {
            uiSchema[ref.name] = ref.options.$uiSchema || {};
          }
        });

        return util.merge({
          schema,
          uiSchema,
          uiFields,
          refs: _props,
          actions: _actions,
          plural: model.options.name.plural,
          singular: model.options.name.singular,
          primaryKey: model.primaryKeyAttribute,
        }, resource);
      },
    }));
};

'use strict';

const _util = require('sequelize/lib/utils');

const util = require('./util');
const types = require('./types');

function _fixParams(schema, props, data) {
  /* istanbul ignore else */
  if (!(schema && schema.properties)) {
    throw new Error(`Missing properties for ${JSON.stringify(schema)}`);
  }

  Object.keys(schema.properties).forEach(prop => {
    /* istanbul ignore else */
    if (props[prop] && data[prop] && !Array.isArray(data[prop])) {
      const copy = data[prop][props[prop].primaryKey];
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

      if (obj.where && obj.where[key]) {
        props.required = false;
        props.where = obj.where[key];

        delete obj.where[key];
      }

      switch (action) {
        case 'findAll':
        case 'findOne':
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

  const fields = model.options.$attributes || {};
  const props = fields[action]
    || fields.findAll
    || [];

  const obj = {
    include: [],
    attributes: [],
  };

  /* istanbul ignore else */
  if (fields.where) {
    params.where = util.merge(params.where, fields.where);
  }

  props.forEach(field => {
    const key = typeof field === 'object'
      ? field.prop
      : field;

    /* istanbul ignore else */
    if (!key) {
      return;
    }

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

  // append foreign-keys
  Object.keys(model.attributes).forEach(prop => {
    /* istanbul ignore else */
    if (model.attributes[prop].references && obj.attributes.indexOf(prop) === -1) {
      obj.attributes.push(prop);
    }
  });

  return pack(action, model, mix(params, obj));
}

module.exports = (deps, model, options) => {
  /* istanbul ignore else */
  if (!deps || !model || typeof deps[model.name] !== 'object') {
    throw new Error(`Expecting model definition, given '${model ? model.name : model}'`);
  }

  const _primaryKey = model.primaryKeyAttribute;

  const _where = {};
  const _props = {};

  options = options || {};

  /* istanbul ignore else */
  if (options[_primaryKey]) {
    _where[_primaryKey] = options[_primaryKey];
  }

  /* istanbul ignore else */
  if (options.where) {
    const p = options.where.split(';');

    p.forEach(v => {
      _where[v.split(':')[0]] = v.split(':')[1];
    });
  }

  const _schema = types.cleanSchema(model.options.$schema || {});

  // delete private references
  Object.keys(model.attributes).forEach(prop => {
    /* istanbul ignore else */
    if (model.attributes[prop].references) {
      delete _schema.properties[prop];
    }
  });

  function push(ref) {
    _props[ref.params.as] = {
      rel: ref.method,
      model: ref.target,
      plural: _util.pluralize(ref.target),
      singular: _util.singularize(ref.target),
      references: util.copy(deps[ref.target].$references),
      virtualized: deps[ref.target].$schema.virtual || false,
    };

    _props[ref.params.as].references.foreignKey = ref.foreignKey || null;
  }

  function append(id, nested) {
    Object.keys(deps[id].$dependencies).forEach(dep => {
      const ref = deps[id].$dependencies[dep];

      push(ref);

      /* istanbul ignore else */
      if (!nested) {
        return;
      }

      const fields = deps[id].$schema.properties;

      // append references from virtual-models
      Object.keys(fields).forEach(prop => {
        const _ref = (fields[prop].items || fields[prop]).$ref;

        /* istanbul ignore else */
        if (deps[_ref]) {
          _props[_ref] = deps[_ref].$schema;

          append(_ref, deps[id].$schema.virtual);
        }
      });
    });
  }

  append(model.name, true);

  // shared resource
  const instance = {
    options: {
      // model references
      refs: _props,

      // placeholder
      result: null,

      // model schema and UI details
      schema: _schema,
      uiSchema: model.options.$uiSchema || {},
      attributes: model.options.$attributes || {},
    },
  };

  function ok(result) {
    instance.options.result = result;

    return result;
  }

  function refs(target) {
    const tasks = [];

    Object.keys(_props).forEach(prop => {
      if (Array.isArray(target[prop])) {
        target[prop].forEach(item => {
          let isNew = true;

          if (item[_props[prop].primaryKey]) {
            isNew = false;
          }

          // FIXME: avoid stealing rows and copy instead?
          tasks.push(fk => {
            if (fk) {
              item[_props[prop].foreignKey] = fk;
            }

            if (isNew) {
              return model.associations[prop].target.create(item);
            }

            return model.associations[prop].target.update(item, {
              where: {
                [_props[prop].primaryKey]: item[_props[prop].primaryKey],
              },
            });
          });
        });

        delete target[prop];
      }
    });

    return tasks;
  }

  instance.actions = {
    findAll: whereOptions =>
      model.findAll(_getOpts(model, 'findAll', { where: whereOptions || _where }))
        .then(ok),

    findOne: whereOptions =>
      model.findOne(_getOpts(model, 'findOne', { where: whereOptions || _where }))
        .then(ok),

    update: (payload, whereOptions) =>
      Promise.resolve()
        .then(() => {
          const _payload = _fixParams(model.options.$schema, _props, payload || options.payload);
          const _tasks = refs(_payload, true);

          return Promise.all(_tasks.map(cb => cb(_payload[_primaryKey])))
            .then(() => model.update(_payload, _getOpts(model, 'update', { where: whereOptions || _where })));
        })
        .then(ok),

    create: payload => {
      const _payload = _fixParams(model.options.$schema, _props, payload || options.payload);
      const _tasks = refs(_payload);

      return Promise.resolve()
        .then(() => model.create(_payload, _getOpts(model, 'create')))
        .then(result =>
          Promise.all(_tasks.map(cb => cb(result[_primaryKey])))
            .then(() => result))
        .then(ok);
    },

    destroy: whereOptions =>
      model.destroy(_getOpts(model, 'destroy', { where: whereOptions || _where }))
        .then(ok),
  };

  return instance;
};

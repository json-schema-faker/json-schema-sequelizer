'use strict';

const _util = require('sequelize/lib/utils');

const util = require('./util');
const types = require('./types');

const fs = require('fs-extra');
const path = require('path');

const RE_DATA = /^data:(.+?);base64,/;

function _fixData(props) {
  const name = path.basename(props.fileName);
  const content = fs.readFileSync(props.filePath).toString('base64');

  return `data:${props.mimeType};name=${name};base64,${content}`;
}

function _expandData(props, attachments) {
  /* istanbul ignore else */
  if (!props || typeof props !== 'object') {
    return props;
  }

  /* istanbul ignore else */
  if (Array.isArray(props)) {
    return props.map(x => _expandData(x, attachments));
  }

  /* istanbul ignore else */
  if (props.dataValues) {
    props.dataValues = _expandData(props.dataValues, attachments);

    return props;
  }

  /* istanbul ignore else */
  if (typeof props.mimeType !== 'undefined'
    && typeof props.fileSize !== 'undefined'
    && typeof props.fileName !== 'undefined'
    && typeof props.filePath !== 'undefined'
    && attachments[0] && typeof props[attachments[0].key] === 'undefined') {
    props[attachments[0].key] = _fixData(props);
    return props;
  }

  Object.keys(props).forEach(key => {
    const value = props[key];

    /* istanbul ignore else */
    if (value && typeof value === 'object') {
      if (typeof value.mimeType !== 'undefined'
        && typeof value.fileSize !== 'undefined'
        && typeof value.fileName !== 'undefined'
        && typeof value.filePath !== 'undefined') {
        props[key] = _fixData(value);
      } else {
        props[key] = _expandData(value, attachments);
      }
    }
  });

  return props;
}

function _saveUploads(payload, attachments) {
  attachments.forEach(upload => {
    if (payload[upload.key]) {
      const details = payload[upload.key].match(RE_DATA)[1].split(';');
      const base64Data = payload[upload.key].replace(RE_DATA, '');

      delete payload[upload.key];

      const fileName = `${base64Data.substr(0, 7)}/${details[1].split('name=')[1]}`;

      const destFile = path.join(upload.dest, fileName);

      fs.outputFileSync(destFile, base64Data, 'base64');

      payload.filePath = path.relative(upload.baseDir || process.cwd(), destFile);
      payload.fileName = fileName.replace(/^\/+/, '');
      payload.fileSize = fs.statSync(destFile).size;
      payload.mimeType = details[0];
    }
  });
}

function _fixParams(schema, props, data) {
  /* istanbul ignore else */
  if (!(schema && schema.properties)) {
    throw new Error(`Missing properties for ${JSON.stringify(schema)}`);
  }

  Object.keys(schema.properties).forEach(prop => {
    /* istanbul ignore else */
    if (props[prop] && data[prop] && !Array.isArray(data[prop])) {
      const pk = props[prop].references.primaryKey;
      const fk = props[prop].references.foreignKey;

      /* istanbul ignore else */
      if (!(pk && fk)) {
        return;
      }

      const copy = data[prop][pk.prop];

      delete data[prop];

      data[fk.prop] = copy;
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
  if (model.primaryKeyAttribute && obj.attributes.indexOf(model.primaryKeyAttribute) === -1) {
    obj.attributes.unshift(model.primaryKeyAttribute);
  }

  Object.keys(obj).forEach(key => {
    /* istanbul ignore else */
    if (!Array.isArray(obj[key]) && typeof obj[key] === 'object' && obj[key] !== null && model.associations[key]) {
      const target = model.associations[key].target;
      const props = pack(action, target, obj[key]);

      /* istanbul ignore else */
      if (obj.where && obj.where[key]) {
        props.required = false;
        props.where = obj.where[key];

        delete obj.where[key];
      }

      switch (action) {
        case 'findAll':
        case 'findOne':
          /* istanbul ignore else */
          if (target.primaryKeyAttribute && props.attributes.indexOf(target.primaryKeyAttribute) === -1) {
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

  function push(ref, nested) {
    // attribute references
    _props[ref.params.as] = {
      rel: ref.method,
      model: ref.target,
      plural: _util.pluralize(ref.target),
      singular: _util.singularize(ref.target),
      references: util.copy(deps[ref.target].$references),
      requiredProps: (deps[ref.target].$schema.required || []).slice(),
    };

    _props[ref.params.as].references.foreignKey = ref.foreignKey || null;

    /* istanbul ignore else */
    if (nested && !ref.foreignKey) {
      _props[ref.params.as].uiSchema = deps[ref.target].$uiSchema || {};
    }
  }

  function append(id, nested) {
    Object.keys(deps[id].$dependencies).forEach(dep => {
      const ref = deps[id].$dependencies[dep];

      push(ref, nested);

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

  // model references
  _props[model.name] = util.merge({
    model: model.name,
  }, model.options.name);

  _props[model.name].references = util.copy(deps[model.name].$references);

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
      uiSchema: util.copy(model.options.$uiSchema || {}),
      attributes: util.copy(model.options.$attributes || {}),
    },
  };

  function ok(result) {
    // transform the result before finishing the response
    instance.options.result = _expandData(instance.options.result || result, options.attachments || []);

    return result;
  }

  function refs(target, isUpdate) {
    const tasks = [];

    Object.keys(target).forEach(prop => {
      /* istanbul ignore else */
      if (Array.isArray(target[prop]) && _props[prop]) {
        const pk = _props[prop].references.primaryKey;
        const fk = _props[prop].references.foreignKey;

        /* istanbul ignore else */
        if (!(pk && fk)) {
          return;
        }

        /* istanbul ignore else */
        if (isUpdate) {
          tasks.push(id => model.associations[prop].target.update({
            [fk.prop]: null,
          }, {
            where: {
              [fk.prop]: id,
            },
          }));
        }

        target[prop].forEach(item => {
          let isNew = true;

          /* istanbul ignore else */
          if (item[pk.prop]) {
            isNew = false;
          }

          tasks.push(id => {
            /* istanbul ignore else */
            if (id) {
              item[fk.prop] = id;
            }

            item = _fixParams(deps[_props[prop].model].$schema, _props, item);

            _saveUploads(item, options.attachments);

            /* istanbul ignore else */
            if (isNew) {
              return model.associations[prop].target.create(item);
            }

            return model.associations[prop].target.update(item, {
              where: {
                [pk.prop]: item[pk.prop],
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
      Promise.resolve()
        .then(() => model.findAll(_getOpts(model, 'findAll', { where: whereOptions || _where })))
        .then(ok),

    findOne: whereOptions =>
      Promise.resolve()
        .then(() => model.findOne(_getOpts(model, 'findOne', { where: whereOptions || _where })))
        .then(ok),

    update: (payload, whereOptions) => {
      const _payload = _fixParams(model.options.$schema, _props, payload || options.payload) || {};

      _saveUploads(_payload, options.attachments);

      const _tasks = refs(_payload, true);

      return Promise.resolve()
        .then(() => Promise.all(_tasks.map(cb => cb(_payload[_primaryKey]))))
        .then(() => typeof model.setPayload === 'function' && model.setPayload(_payload, 'update'))
        .then(() => model.update(_payload, _getOpts(model, 'update', {
          where: whereOptions || _where,
        })))
        .then(ok);
    },

    create: payload => {
      const _payload = _fixParams(model.options.$schema, _props, payload || options.payload) || {};

      _saveUploads(_payload, options.attachments);

      const _tasks = refs(_payload);

      return Promise.resolve()
        .then(() => typeof model.setPayload === 'function' && model.setPayload(_payload, 'create'))
        .then(() => model.create(_payload, _getOpts(model, 'create')))
        .then(result =>
          Promise.all(_tasks.map(cb => cb(result[_primaryKey])))
            .then(() => result))
        .then(ok);
    },

    destroy: whereOptions =>
      Promise.resolve()
        .then(() => model.destroy(_getOpts(model, 'destroy', { where: whereOptions || _where })))
        .then(ok),
  };

  return instance;
};

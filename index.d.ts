import type {
  Model, ModelCtor, ModelOptions, Sequelize, Options, QueryInterface,
  FindOptions, CountOptions, CreateOptions, UpdateOptions, DestroyOptions, SyncOptions,
} from  'sequelize';
import type { JsonObject } from 'type-fest';
import type { DownToOptions, UpToOptions, Migration } from 'umzug';

import type { JSONSchema4 } from 'json-schema';
export type { JSONSchema4 } from 'json-schema';

export * from  'sequelize';

interface UmzugInterface {
  run(script: string): Promise<void>;
  up(opts?: UpToOptions): Promise<Migration[]>;
  down(opts?: DownToOptions): Promise<Migration[]>;
  next(): Promise<Migration[]>;
  prev(): Promise<Migration[]>;
  status(): {
    pending: string[],
    executed: string[],
  };
}

interface UmzugMigrateCallback {
  (query: QueryInterface, sequelize: Sequelize, promise?: typeof Promise): Promise<Migration[]>;
}

type UmzugMigrateOptions = {
  configFile?: string;
  baseDir?: string;
  logging?: boolean | ((sql: string, timing?: number) => void);
  database?: {
    modelName?: string;
    tableName?: string;
    columnName?: string;
  };
};

interface ConnectionSettings extends Options {
  connection?: string;
}

interface JSONSchemaSequelizerMap {
  (def: ModelDefinition, name: string, sequelize: Sequelize): ModelDefinition;
}

export type JSONSchemaSequelizerRefs = JSONSchema4[] | { [k: string]: JSONSchema4 };
export type JSONSchemaSequelizerDefs = { definitions?: { [k: string]: JSONSchema4 } };

declare function JSONSchemaSequelizer(settings: ConnectionSettings, refs?: JSONSchemaSequelizerRefs, cwd?: string): ResourceRepository;
declare namespace JSONSchemaSequelizer {
  var migrate: {
    (sequelize: Sequelize, options: { [key: string]: UmzugMigrateCallback }, bind: true): { [key: string]: () => Promise<void> };
    (sequelize: Sequelize, options: UmzugMigrateOptions, bind?: boolean): UmzugInterface;
  }
  var bundle: (schemas: JSONSchema4[], definitions?: string | { [k: string]: JSONSchema4 }, description?: string) => void;
  var generate: (dump: JSONSchemaSequelizerDefs | null, models: Model[], squash?: boolean, globalOptions?: ModelOptions) => void;
  var scan: (cwd: string, cb: JSONSchemaSequelizerMap) => ModelDefinition[];
  var refs: (cwd: string, prefix?: string) => JSONSchema4[];
  var sync: (deps: Model[], opts?: SyncOptions) => Promise<Model>;
  var clear: (deps: Model[], opts?: DestroyOptions) => Promise<number[]>;
}

export interface JSONSchemaSequelizerInterface {
  add(model: ModelDefinition, isClass: true): ModelCtor<Model>;
  add(model: ModelDefinition, isClass?: boolean): this;
  scan(cb: Function): this;
  refs(cwd: string, prefix: string): this;
  sync(opts: SyncOptions): Promise<this>;
  close(): this;
  ready(cb: Function): this;
  connect(): Promise<this>;
}

export interface ResourceRepositoryOf<DB> extends JSONSchemaSequelizerInterface {
  resource<M extends Model>(name: keyof DB, opts?: ResourceOptions): ResourceModel<M>;
}

export interface ResourceRepository extends JSONSchemaSequelizerInterface {
  resource<M extends Model>(name: string, opts?: ResourceOptions): ResourceModel<M>;
}

export interface ResourceAttachment {
  path: string;
  name?: string;
  size?: number;
  type?: string;
  lastModifiedDate?: string;
}

export interface ResourceOptions {
  raw?: boolean;
  keys?: string[];
  where?: string;
  payload?: JsonObject;
  logging?: boolean | ((sql: string, timing?: number) => void);
  noupdate?: boolean;
  fallthrough?: boolean;
  attachments?: {
    files?: {
      [key: string]: ResourceAttachment | ResourceAttachment[];
    };
    baseDir?: string;
    uploadDir?: string;
  };
  upload?(params: {
    payload: JsonObject,
    metadata: ResourceAttachment,
    destFile: string,
    field: string,
    schema: JSONSchema4,
  }): Promise<void>;
}

export interface ResourceModel<T> {
  options: {
    model: string;
    refs: { [key: string]: JSONSchema4 };
    schema: JSONSchema4;
    uiSchema: JsonObject;
    attributes: JsonObject;
  };
  actions: {
    update(payload: JsonObject, opts?: UpdateOptions): Promise<[number, number | undefined]>;
    create(payload: JsonObject, opts?: CreateOptions): Promise<[T, JsonObject]>;
    findAll(opts?: FindOptions): Promise<T[]>;
    findOne(opts?: FindOptions): Promise<T | null>;
    destroy(opts?: DestroyOptions): Promise<number>;
    count(opts?: CountOptions): Promise<number>;
  };
}

export interface ModelDefinition {
  $class?: ModelCtor<Model>;
  $schema: JSONSchema4;
  $uiSchema?: JsonObject;
  $attributes?: ModelAttributes;
}

export interface ModelAttributes {
  findAll?: ModelAttribute[];
  findOne?: ModelAttribute[];
  destroy?: ModelAttribute[];
  create?: ModelAttribute[];
  update?: ModelAttribute[];
  count?: ModelAttribute[];
}

export type ModelAttribute = string | { prop: string };

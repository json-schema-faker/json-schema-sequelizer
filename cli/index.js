const USAGE_INFO = `
Perform database changes

  --only       Optional. Filter out specific models

  migrate

    --make     Optional. Take an snapshot from your models
    --apply    Optional. Save changes from executed migrations

    --create   Optional. Create database from your schema
    --destroy  Optional. Drop the database entirely

    --up       Optional. Apply all pending migrations
    --down     Optional. Revert all applied migrations
    --next     Optional. Apply the latest pending migration
    --prev     Optional. Revert the latest applied migration

    --from     Optional. Apply migrations from this offset
    --to       Optional. Apply migrations up to this offset

  backup

    --import   Optional. Load into the database, directory or file
    --export   Optional. Save backup to destination, directory

Examples:
  {bin} migrate --make
  {bin} migrate --apply "migration description"
  {bin} backup --load ../from/backup/or/path/to/seeds
  {bin} backup --save path/to/seeds --only Product,Cart
`;

function getHelp(binary) {
  return USAGE_INFO.replace(/{bin}/g, binary || process.argv.slice(1)[0]);
}

function runHook(argv, conn) {
  return require(`./${argv._.shift()}`)(conn, {
    migrations: argv._.slice(),
    options: argv.flags,
  });
}

module.exports = {
  usage: getHelp,
  execute: runHook,
};

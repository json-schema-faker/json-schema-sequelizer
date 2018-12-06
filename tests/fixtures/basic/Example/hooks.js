module.exports = {
  beforeCreate(row) {
    row.now = new Date();
  },
};

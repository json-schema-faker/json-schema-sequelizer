module.exports = {
  truth() {
    return 42;
  },
  get(cb) {
    return this.findOne({
      logging: cb,
      where: this.whereOp($ => ({
        id: {
          [$.gte]: 3,
        },
      })),
    });
  },
};

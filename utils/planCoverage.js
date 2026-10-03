const getPlanFeatures = (type) => type === 'both' ? ['chat', 'podcast'] : [type];

const plansOverlap = (firstType, secondType) => {
    const firstFeatures = getPlanFeatures(firstType);
    const secondFeatures = getPlanFeatures(secondType);
    return firstFeatures.some((feature) => secondFeatures.includes(feature));
};

module.exports = { getPlanFeatures, plansOverlap };

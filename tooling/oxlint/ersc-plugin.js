const noInlineYield = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      bindYield: 'Bind the yielded value before using it in another expression.',
    },
  },
  create(context) {
    return {
      YieldExpression(node) {
        if (!node.delegate) {
          return;
        }

        const parent = node.parent;
        const isVariableInitializer = parent.type === 'VariableDeclarator' && parent.init === node;
        const isStandalone = parent.type === 'ExpressionStatement';
        const isReturned = parent.type === 'ReturnStatement';
        const isStandaloneAssignment =
          parent.type === 'AssignmentExpression' &&
          parent.right === node &&
          parent.parent.type === 'ExpressionStatement';

        if (isVariableInitializer || isStandalone || isReturned || isStandaloneAssignment) {
          return;
        }

        context.report({ node, messageId: 'bindYield' });
      },
    };
  },
};

export default {
  meta: { name: 'ersc' },
  rules: { 'no-inline-yield': noInlineYield },
};

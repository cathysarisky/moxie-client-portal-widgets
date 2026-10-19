'use strict';
const acorn = require('acorn');

function parseSource(source) {
  const comments = [];
  const ast = acorn.parse(source, {
    ecmaVersion: 5,
    onComment: (block, text, start, end) => { comments.push({ start, end }); }
  });
  return { ast, comments };
}

function isData(node) {
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
      return true;
    case 'ArrayExpression':
      return node.elements.every((e) => e && isData(e));
    case 'ObjectExpression':
      return node.properties.every((p) => isData(p.value));
    case 'BinaryExpression':
      return node.operator === '+' && isData(node.left) && isData(node.right);
    case 'UnaryExpression':
      return node.operator === '-' && isData(node.argument);
    default:
      return false;
  }
}

function outerFunctionBody(ast) {
  const first = ast.body[0];
  if (!first || first.type !== 'ExpressionStatement') return [];
  const call = first.expression;
  if (call.type !== 'CallExpression' || call.callee.type !== 'FunctionExpression') return [];
  return call.callee.body.body;
}

function topLevelDataVars(ast) {
  const vars = [];
  outerFunctionBody(ast).forEach((stmt) => {
    if (stmt.type !== 'VariableDeclaration') return;
    stmt.declarations.forEach((d) => {
      if (!d.init || !isData(d.init)) return;
      vars.push({
        name: d.id.name,
        start: stmt.start,
        end: stmt.end,
        initStart: d.init.start,
        initEnd: d.init.end
      });
    });
  });
  return vars;
}

function evaluateVars(source, vars) {
  const decls = vars.map((v) => source.slice(v.start, v.end)).join('\n');
  const names = vars.map((v) => v.name).join(',');
  return new Function(decls + '\nreturn {' + names + '};')();
}

function tidy(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function applyEdits(source, edits) {
  return edits
    .slice()
    .sort((a, b) => b.start - a.start)
    .reduce((text, e) => text.slice(0, e.start) + e.text + text.slice(e.end), source);
}

function commentEdits(comments) {
  return comments.map((c) => ({ start: c.start, end: c.end, text: '' }));
}

function stripComments(source) {
  return tidy(applyEdits(source, commentEdits(parseSource(source).comments)));
}

function extractFile(source, lists) {
  const { ast, comments } = parseSource(source);
  const vars = topLevelDataVars(ast);
  const found = vars.map((v) => v.name);
  const slots = vars.filter((v) => lists.settings.includes(v.name));
  const slotEdits = slots.map((v) => ({ start: v.initStart, end: v.initEnd, text: '{{' + v.name + '}}' }));
  const keptComments = commentEdits(comments).filter((c) =>
    !slotEdits.some((s) => c.start >= s.start && c.end <= s.end));
  const all = evaluateVars(source, vars);
  const defaults = {};
  slots.forEach((v) => { defaults[v.name] = all[v.name]; });
  return {
    template: tidy(applyEdits(source, keptComments.concat(slotEdits))),
    defaults,
    missing: lists.settings.filter((n) => !found.includes(n)),
    unlisted: found.filter((n) => !lists.settings.includes(n) && !lists.internal.includes(n))
  };
}

module.exports = { parseSource, isData, topLevelDataVars, evaluateVars, stripComments, extractFile };

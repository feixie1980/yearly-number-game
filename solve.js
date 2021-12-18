const argv = require('yargs').argv;

const { create, all } = require('mathjs');
const math = create(all);
const fmath = create(all);
fmath.config({
  number: 'Fraction'
});
const Fraction = require('fraction.js');

let inputDigits, inputDigitCntMap, repeatFractionMap = new Map();
const binaryOps = ['+', '-', '*', '/', '^'];
const unaryPostfixOps = ['!'];
const unaryPrefixOps = ['-'];
const unaryFuncOps = ['sqrt'];
const binaryFuncOps = ['permutations', 'combinations'];

function getArgvs() {
  let number = argv.number ? `${argv.number}` : '2021';
  inputDigits = number.split('');
  inputDigitCntMap = createDigitCntMap(inputDigits);
}

function createDigitCntMap(digits) {
  return digits.reduce((map, digit) => {
    if (!map.has(digit))
      map.set(digit, 1);
    else
      map.set(digit, map.get(digit) + 1);
    return map;
  }, new Map());
}

function replacer(key, value) {
  const originalObject = this[key];
  if(originalObject instanceof Map) {
    return {
      dataType: 'Map',
      value: Array.from(originalObject.entries()), // or with spread: value: [...originalObject]
    };
  } else {
    return value;
  }
}

function getKey(...digits) {
  return digits.sort((a,b) => a-b).join('');
}

function getDigitPermus(digits) {
  if (digits.length === 0) {
    return [];
  }
  let results = [[digits[0]]];
  for (const permu of getDigitPermus(digits.slice(1))) {
    results.push([...permu]);
    for(let i = 0; i < permu.length; i++) {
      results.push([...permu.slice(0, i), digits[0], ...permu.slice(i)]);
    }
    results.push([...permu, digits[0]]);
  }
  return results;
}

let valueCheckMap = new Map();

function addExpression(map, key, expression, op) {
  try {
    // If this is a repeating decimals, we do not evaluate to a numbered value
    let hasRepeatDecimals = expression.indexOf(')1') !== -1;
    let value = math.evaluate(expression);

    // this is to combat round-off errors, see https://mathjs.org/docs/datatypes/numbers.html#roundoff-errors
    value = +math.format(value, {precision: 14});

    /*
    if (isFinal && (!Number.isInteger(value) || value < 0 || value > 100)) {
      return;
    }
     */

    if ( !hasRepeatDecimals && `${value % 1}`.length > 10 || value > 10000 || isNaN(value)) {
      // value equals or more than 2 digits of decimals, unlikely to be an answer
      return;
    }

    if (!map.has(key)) {
      map.set(key, []);
      valueCheckMap.set(key, new Set());
    }
    let exprArray = map.get(key);
    if (!valueCheckMap.get(key).has(value)) {
      exprArray.push( {expression, value, op});
      valueCheckMap.get(key).add(value);
      if (key.length === 4) {
        //console.log(`exrp: '${expression}'`)
      }
    }
  } catch (e) {
    //console.error(e);
  }

}

function genRepeatingDecimals(decimalStr) {
  let strs = [];
  for (let i = decimalStr.length - 1; i >= 1; i--) {
    if (decimalStr.charAt(i) === '.')
      break;
    strs.push(`${decimalStr.substring(0, i)}(${decimalStr.substring(i, decimalStr.length)})`);
  }
  return strs;
}

function genFractionExps(decimalStr) {
  return genRepeatingDecimals(decimalStr)
    .map(str => {
      let c = new Fraction(str);
      return { expression: `(${c.n}/${c.d})1`, decimalExpression: str };
    });
}

function totalExpCount(map) {
  let cnt = 0;
  [...map.values()].forEach(v => {
    cnt += v.length;
  });
  return cnt;
}

function bootstrapMap() {
  let map = new Map();
  let perms = getDigitPermus(inputDigits);
  perms = perms.filter(p => p.length >= 1 && p[0] !== 0);
  for (const p of perms) {
    if (p.length !== inputDigits.length) {
      if (p.length === 1 || p[0] !== '0') {
        // add multi-digits values such as '201' '12'
        addExpression(map, getKey(...p), `${p.join('')}`);
      }

      // add '.02', '.2', and etc; we first need to remove trailing 0s from p
      while(p[p.length-1] === '0'){
        p.pop();
      }
      const decimalStr = `.${p.join('')}`;
      addExpression(map, getKey(...p), decimalStr);

      // add repeating decimals, using MathJs's fractionJS format:  0.(3)
      const fracExprs = genFractionExps(decimalStr);
      fracExprs.forEach(exp => {
        if (exp.decimalExpression.length <= 5) {
          addExpression(map, getKey(...p), exp.expression);
          repeatFractionMap.set(exp.decimalExpression, exp.expression);
        }
      });
    }
  }

  console.log('total exps:' + totalExpCount(map));
  return map;
}

function addUnaryExps(map, keyLength) {
  const keys = [...map.keys()].filter(key => key.length === keyLength);
  for (const key of keys) {
    const exprArray = [...map.get(key)];
    for (let { expression, op } of exprArray) {
      const onlyIntegerExpr = op === '!' || op === '-' || op === 'sqrt' && (expression.indexOf('sqrt') !== -1 || expression.indexOf(')1') === -1);
      if ( onlyIntegerExpr && !Number.isInteger(math.evaluate(expression))) {
        continue;
      }

      const exp = isNaN(expression) ? `(${expression})` : expression;

      for (const unaryOp of unaryPrefixOps) {
        if (op !== unaryOp) {
          // for instance: prevent applying multiple '!!'
          addExpression(map, key, `${unaryOp}${exp}`, unaryOp);
        }
      }

      for (const unaryOp of unaryPostfixOps) {
        if (op !== unaryOp) {
          // for instance: prevent applying multiple '!!'
          addExpression(map, key, `${exp}${unaryOp}`, unaryOp);
        }
      }

      for (const unaryOp of unaryFuncOps) {
        // for instance: prevent applying multiple 'sqrt(sqrt...'
        if (op !== unaryOp) {
          addExpression(map, key, `${unaryOp}(${expression})`, unaryOp);
        }
      }
    }
  }
}

function genCombinationN(digits, n) {
  if (n === 1)
    return digits.map(d => [d]);
  let results = [];
  for (let i = 0; i <= digits.length - n; i++) {
    for (const comb of genCombinationN(digits.slice(i + 1), n - 1)) {
      results.push([digits[i], ...comb]);
    }
  }
  return results;
}

function isValidPair(c1, c2) {
  const cntMap = createDigitCntMap([...c1, ...c2]);
  for (const digit of cntMap.keys()) {
    if (cntMap.get(digit) > inputDigitCntMap.get(digit)) {
      return false;
    }
  }
  return true;
}

/**
 * To get possible expressions from the digits, say, [2, 0, 2, 1], we compute possible expressions from the subset of
 * digits first, and then combine pairs of these with binary operations.  For instance, we compute possible expressions
 * for (2, 0), (2, 1), first, then combine expressions from these.
 *
 * This function generates possible pairs for the given digits for expressions with n-digits.
 * @param n
 * @returns {[]}
 */
function genDigitTuples(n) {
  let dedupeCombs = [];
  for (const comb of genCombinationN(inputDigits, n)) {
    // dedupe
    if (!dedupeCombs.find(r => comb.sort().join('') === r.sort().join(''))) {
      dedupeCombs.push(comb);
    }
  }

  let allPairs = [], dedupeCheck = new Set();
  for (const comb of dedupeCombs) {
    for (let i = 1; i <= n / 2; i++) {
      const grp1 = genCombinationN(comb, i);
      const grp2 = genCombinationN(comb, n - i);
      grp1.forEach(c1 => {
        grp2.forEach(c2 => {
          const k = getKey(...c1) + '-' + getKey(...c2);
          if (isValidPair(c1, c2) && !dedupeCheck.has(k)) {
            allPairs.push([c1, c2]);
            dedupeCheck.add(k);
          }
        })
      })
    }
  }

  //console.log(allPairs);
  return allPairs;
}

function getExprPairs(map, key1, key2) {
  let pairs = [];
  for (const exp1 of map.get(key1)) {
    for (const exp2 of map.get(key2)) {
      pairs.push([exp1, exp2]);
    }
  }
  return pairs;
}

function solution() {
  let map = bootstrapMap();
  addUnaryExps(map, 1);

  for (let n = 2; n <= 4; n++) {
    console.log(`n: ${n}`);
    const nDigitsCombs = genDigitTuples(n);
    console.log(`nDigitsCombs: ${nDigitsCombs.length}`);
    //console.log(nDigitsCombs);
    let i = 0;
    for (const pair of nDigitsCombs) {
      const key1 = getKey(...pair[0]), key2 = getKey(...pair[1]);
      if (!map.has(key1) || !map.has(key2)) {
        continue;
      }
      const combinedKey = getKey(...key1, ...key2);
      const exprPairs = getExprPairs(map, key1, key2);
      console.log(`${i++}: exprPairs: ${exprPairs.length}\tall exprs:${totalExpCount(map)}`);
      let j = 0;
      for (const pair of exprPairs) {
        if (n === 4) {
          //console.log(`${j++}: pair`);

        }
        //console.log(`computing pair: ${JSON.stringify(pair)}`);
        let exp1 = isNaN(pair[0].expression) ? `(${pair[0].expression})` : `${pair[0].expression}`;
        let exp2 = isNaN(pair[1].expression) ? `(${pair[1].expression})` : `${pair[1].expression}`;

        for (const binaryOp of binaryOps) {
          addExpression(map, combinedKey, `${exp1} ${binaryOp} ${exp2}`, binaryOp);
          addExpression(map, combinedKey, `${exp2} ${binaryOp} ${exp1}`, binaryOp);
        }

        for (const binaryFunc of binaryFuncOps) {
          addExpression(map, combinedKey, `${binaryFunc}(${pair[0].expression}, ${pair[1].expression})`, binaryFunc);
          addExpression(map, combinedKey, `${binaryFunc}(${pair[1].expression}, ${pair[0].expression})`, binaryFunc);
        }
      }
      addUnaryExps(map, n);
      //console.log(JSON.stringify(map, replacer, 2));
    }
  }
  //console.log(JSON.stringify(map, replacer, 2));
  const key = [...map.keys()].filter(k => k.length === inputDigits.length)[0];
  let exprs = map.get(key);
  exprs = exprs.filter(exp => Number.isInteger(exp.value) && exp.value <= 100 && exp.value > 0);
  exprs.sort((a, b) => a.value - b.value);
  exprs.forEach(expr => {
    console.log(`${expr.value}: ${expr.expression}`);
  });
  console.log(`Total found: ${exprs.length}`);
  //console.log(JSON.stringify(map.get(getKey(1, 2, 2)), replacer, 2));
  //console.log(JSON.stringify(repeatFractionMap, replacer, 2));
}

(function run() {
  try {
    getArgvs();
    let startTime = new Date().getTime();
    solution();
    let endTime = new Date().getTime();
    console.log(`Solution 1.a: ${endTime - startTime} ms`);

  } catch (error) {
    console.error(error);
    process.exit(1);
  }

  process.exit(0);

})();

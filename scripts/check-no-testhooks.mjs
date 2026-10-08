// 배포 빌드에 테스트 훅이 들어가지 않았는지 확인 (D16, TEST_CASES §3). 하나라도 나오면 종료 코드 1.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = process.argv[2] || '.output/chrome-mv3';
const NEEDLES = ['127.0.0.1:8765', 'data-wc-target', 'data-wc-pad', 'data-wc-nomime', '__wc'];

function* files(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(js|mjs|html|json|css)$/.test(name)) yield p;
  }
}

const hits = [];
for (const f of files(dir)) {
  const text = readFileSync(f, 'utf8');
  for (const n of NEEDLES) if (text.includes(n)) hits.push(`${relative(dir, f)}: "${n}"`);
}
if (hits.length) {
  console.error('❌ 배포 빌드에 테스트 훅 문자열이 있습니다:\n  ' + hits.join('\n  '));
  process.exit(1);
}
console.log(`✅ 테스트 훅 검사 통과 (${dir})`);

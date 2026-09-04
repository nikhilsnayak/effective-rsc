'use server';

let serverCount = 0;

export async function getCount() {
  return serverCount;
}

export async function incrementCount() {
  serverCount += 1;
  return serverCount;
}

import { Loading } from 'effective-rsc';

export default Loading.make(() => {
  return (
    <main aria-busy='true'>
      <p>Loading root route...</p>
    </main>
  );
});

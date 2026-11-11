# Task: Animate a gallery route change

This is a fictional fixture app. It uses Vite, React and React DOM 19.3, and React Router with a client-side `BrowserRouter`. It has no server components. Add native view transitions for this gallery drill-down without a third-party animation package.

The current route tree is:

```tsx
function App() {
  return <><Header /><Routes>
    <Route path="/photos" element={<Gallery />} />
    <Route path="/photos/:id" element={<PhotoDetail />} />
  </Routes></>;
}
const photos = [
  { id: 'fern', src: '/fixtures/fern.jpg', title: 'Fern' },
  { id: 'lake', src: '/fixtures/lake.jpg', title: 'Lake' },
];
function Gallery() {
  return <main>{photos.map(photo => <Link key={photo.id} to={`/photos/${photo.id}`}>
    <img src={photo.src} alt={photo.title} />
  </Link>)}</main>;
}
function PhotoDetail() {
  const { id } = useParams();
  const photo = photos.find(photo => photo.id === id);
  if (!photo) return <main>Photo not found</main>;
  return <main><Link to="/photos">Back to gallery</Link>
    <img src={photo.src} alt={photo.title} /><h1>{photo.title}</h1>
  </main>;
}
```

The selected thumbnail should become the detail image while surrounding page content moves in the direction of the hierarchy. The explicit Back link should reverse that movement. Other visible thumbnails and the persistent header must remain visually coherent. A direct load of either URL must show its content without an entrance animation. Native history navigation should remain functional even where animation cannot be provided.

Show the component and global CSS changes, including animation timing and snapshot layering. Explain the naming choices when both photos are visible, how the navigation triggers integrate with React Router, and how reduced-motion preferences and unsupported browsers behave. Do not assume any browser checks or package commands have already run.

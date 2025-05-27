// // import React, {useState} from 'react';
// import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
// import VideoCall from './components/VideoCall';
// import JoinRoom from './components/JoinRoom';

// function App() {
//   // const [roomId, setRoomId] = useState(null);
//   //return (
//     // <>
//     // {roomId ? (
//     //   <VideoCall roomId = {roomId}/>
//     // ) : (
//     //   <JoinRoom onJoin={(roomId) => setRoomId(roomId)}/>
//     // )}
//     // </>
//     //);
// return(
//   //No useState, no manual component swapping. The router takes care of showing the correct page.
//     <Router>
//     <Routes>
//       <Route path="/" element={<JoinRoom />} />
//       <Route path="/room/:roomId" element={<VideoCall />} />
//     </Routes>
//   </Router>
//     // <h1>Video Call</h1>
// );
// }

// export default App;
import React, { useEffect } from 'react';
import { BrowserRouter , Routes, Route } from 'react-router-dom';
import JoinRoom from './components/JoinRoom';
import VideoCall from './components/VideoCall';

const App = () => {
  // useEffect(() => {
  //   console.log('Client started on http://localhost:3000');
  // }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<JoinRoom />} />
        <Route path="/room/:roomId" element={<VideoCall />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const JoinRoom = () => {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleJoin = () => {
    if (roomId.trim()) {
      navigate(`/room/${roomId}`);
    }
  };

  return (
    <div className='flex flex-col items-center justify-center h-screen gap-4'>
      <h1 className='text-2xl font-bold'>Join Room</h1>
      <input
        type='text'
        placeholder='Enter Room ID'
        className='border p-2 rounded'
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
      />
      <button
        onClick={handleJoin}
        className='bg-blue-500 text-white px-4 py-2 rounded'
      >
        Join
      </button>
    </div>
  );
};

export default JoinRoom;

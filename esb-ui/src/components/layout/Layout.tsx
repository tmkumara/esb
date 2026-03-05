import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { NavBar } from './NavBar';
import { ToastContainer } from '../ui/Toast';

export default function Layout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar />
      <NavBar />
      <main className="flex-1 overflow-auto bg-[#f0f4ff]">
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  );
}

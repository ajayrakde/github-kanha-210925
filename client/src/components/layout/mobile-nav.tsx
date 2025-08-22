import { useLocation } from "wouter";

export default function MobileNav() {
  const [location, setLocation] = useLocation();

  const navItems = [
    { path: "/", icon: "fas fa-home", label: "Home" },
    { path: "/cart", icon: "fas fa-shopping-cart", label: "Cart" },
    { path: "/admin", icon: "fas fa-cog", label: "Admin" },
    { path: "/influencer", icon: "fas fa-chart-line", label: "Influencer" },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2">
      <div className="flex justify-around">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => setLocation(item.path)}
            className={`flex flex-col items-center p-2 transition-colors ${
              location === item.path ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'
            }`}
            data-testid={`nav-${item.label.toLowerCase()}`}
          >
            <i className={`${item.icon} text-lg`}></i>
            <span className="text-xs mt-1">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

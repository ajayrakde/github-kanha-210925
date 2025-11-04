import { User, Package, MapPin, LogOut, FileText, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";

interface UserDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserDrawer({ isOpen, onClose }: UserDrawerProps) {
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
      onClose();
      setLocation("/");
      window.location.reload();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const menuItems = [
    {
      icon: User,
      label: "Profile",
      path: "/profile",
      testId: "menu-profile",
    },
    {
      icon: Package,
      label: "Orders",
      path: "/orders",
      testId: "menu-orders",
    },
    {
      icon: MapPin,
      label: "Addresses",
      path: "/profile",
      hash: "#addresses",
      testId: "menu-addresses",
    },
    {
      icon: FileText,
      label: "Terms & Conditions",
      path: "/terms-of-service",
      testId: "menu-terms",
    },
    {
      icon: RefreshCw,
      label: "Refund Policy",
      path: "/refund-policy",
      testId: "menu-refund",
    },
  ];

  const handleMenuClick = (item: typeof menuItems[0]) => {
    if (item.hash) {
      setLocation(item.path);
      setTimeout(() => {
        const element = document.querySelector(item.hash!);
        element?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } else {
      setLocation(item.path);
    }
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 md:hidden"
          onClick={onClose}
          data-testid="drawer-backdrop"
        />
      )}

      {/* Bottom Sheet Drawer */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-white z-40 transform transition-transform duration-300 ease-out md:hidden rounded-t-2xl ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
        data-testid="user-drawer"
      >
        {/* Menu Items */}
        <div className="flex flex-col p-2 pb-20">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.testId}
                onClick={() => handleMenuClick(item)}
                className="flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 rounded-lg transition-colors"
                data-testid={item.testId}
              >
                <Icon size={20} className="text-gray-600" />
                <span className="text-sm font-medium text-gray-900">{item.label}</span>
              </button>
            );
          })}

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 text-left hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors mt-2"
            data-testid="button-logout"
          >
            <LogOut size={20} className="text-red-600" />
            <span className="text-sm font-medium text-red-600">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
}

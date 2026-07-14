import React, { useEffect, useState } from "react";
import {
  Card,
  CardBody,
  Table,
  TableContainer,
  TableHeader,
  TableCell,
  TableBody,
  TableRow,
} from "@windmill/react-ui";
import { FiShoppingCart, FiUsers, FiCreditCard } from "react-icons/fi";

import PageTitle from "@/components/Typography/PageTitle";
import OrderServices from "@/services/OrderServices";
import CustomerServices from "@/services/CustomerServices";
import requests from "@/services/httpService";

const getTodayString = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatDateDMY = (date) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const StatCard = ({ title, value, Icon, iconClass }) => (
  <Card>
    <CardBody className="flex items-center">
      <div className={`p-3 rounded-full mr-4 ${iconClass}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="mb-1 text-sm font-medium text-gray-600 dark:text-gray-400">
          {title}
        </p>
        <p className="text-2xl font-semibold text-gray-700 dark:text-gray-200">
          {value}
        </p>
      </div>
    </CardBody>
  </Card>
);

const Dashboard = () => {
  const today = getTodayString();

  const [loading, setLoading] = useState(true);
  const [todayOrders, setTodayOrders] = useState([]);
  const [todayOrderCount, setTodayOrderCount] = useState(0);
  const [dishSummary, setDishSummary] = useState([]);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);

      // Today's orders (+ dish summary)
      try {
        const res = await OrderServices.searchOrders({ date: today, limit: 1000 });
        const data = res?.data || res;
        if (mounted) {
          setTodayOrders(data?.orders || []);
          setTodayOrderCount(data?.total || (data?.orders || []).length);
          setDishSummary(data?.dishSummary || []);
        }
      } catch (e) {
        console.error("Dashboard: today's orders failed", e);
      }

      // Active subscriptions (total)
      try {
        const res = await requests.get(
          "/orders/get-All/user-Subscription?page=1&limit=1"
        );
        if (mounted) setSubscriptionCount(res?.total || 0);
      } catch (e) {
        console.error("Dashboard: subscriptions failed", e);
      }

      // Total customers
      try {
        const res = await CustomerServices.getAllCustomers({ searchText: "" });
        const list = Array.isArray(res) ? res : res?.customers || [];
        if (mounted) setCustomerCount(list.length);
      } catch (e) {
        console.error("Dashboard: customers failed", e);
      }

      if (mounted) setLoading(false);
    };

    load();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageTitle>Dashboard</PageTitle>

      {/* Stat cards */}
      <div className="grid gap-4 mb-8 md:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Orders Today"
          value={loading ? "…" : todayOrderCount}
          Icon={FiShoppingCart}
          iconClass="text-emerald-600 dark:text-emerald-100 bg-emerald-100 dark:bg-emerald-600"
        />
        <StatCard
          title="Active Subscriptions"
          value={loading ? "…" : subscriptionCount}
          Icon={FiCreditCard}
          iconClass="text-blue-600 dark:text-blue-100 bg-blue-100 dark:bg-blue-600"
        />
        <StatCard
          title="Total Customers"
          value={loading ? "…" : customerCount}
          Icon={FiUsers}
          iconClass="text-orange-600 dark:text-orange-100 bg-orange-100 dark:bg-orange-500"
        />
      </div>

      {/* Today's dish summary */}
      {dishSummary.length > 0 && (
        <>
          <PageTitle>Today's Meals ({formatDateDMY(today)})</PageTitle>
          <div className="mb-8 flex flex-wrap gap-4">
            {dishSummary.map((item) => (
              <Card
                key={item.dish}
                className="w-full sm:w-1/2 md:w-1/3 lg:w-1/5 xl:w-1/6 min-w-[170px] bg-gradient-to-br from-emerald-200 to-emerald-100 border border-emerald-300"
              >
                <CardBody className="flex flex-col items-center text-center">
                  <span className="text-lg font-semibold text-emerald-800 mb-1">
                    {item.dish}
                  </span>
                  <span className="text-3xl font-bold text-emerald-900">
                    {item.count}
                  </span>
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Today's orders table */}
      <PageTitle>Today's Orders</PageTitle>
      <Card className="min-w-0 shadow-xs overflow-hidden">
        <CardBody>
          {loading ? (
            <p>Loading...</p>
          ) : todayOrders.length === 0 ? (
            <p>No orders for today.</p>
          ) : (
            <TableContainer>
              <Table>
                <TableHeader>
                  <tr>
                    <TableCell>#</TableCell>
                    <TableCell>Child Name</TableCell>
                    <TableCell>Class &amp; Section</TableCell>
                    <TableCell>School</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Food</TableCell>
                  </tr>
                </TableHeader>
                <TableBody>
                  {todayOrders.map((order, idx) => (
                    <TableRow key={(order.childId || idx) + "-" + order.food}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>
                        {order.childFirstName} {order.childLastName}
                      </TableCell>
                      <TableCell>
                        {order.childClass} - {order.section}
                      </TableCell>
                      <TableCell>{order.school}</TableCell>
                      <TableCell>{order.location}</TableCell>
                      <TableCell>{order.food}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default Dashboard;

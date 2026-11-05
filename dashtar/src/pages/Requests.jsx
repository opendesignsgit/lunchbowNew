import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardBody,
  Button,
  Badge,
  Select,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHeader,
  TableRow,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textarea,
  Label,
} from "@windmill/react-ui";
import { Link, useHistory, useLocation } from "react-router-dom";

import PageTitle from "@/components/Typography/PageTitle";
import TableLoading from "@/components/preloader/TableLoading";
import AdminOpsServices from "@/services/AdminOpsServices";
import { notifyError, notifySuccess } from "@/utils/toast";
import { fmtDateTime, errMessage } from "@/utils/adminOps";

const PAGE_SIZE = 20;
const SCHOOL_STATUSES = ["pending", "approved", "rejected"];
const ENQUIRY_STATUSES = ["new", "contacted", "closed"];
const ENQUIRY_KINDS = ["contact-us", "get-in-touch", "talk-nutrition", "school-service", "free-trial"];

const statusType = (s) => {
  switch (s) {
    case "approved":
    case "closed":
      return "success";
    case "rejected":
      return "danger";
    case "contacted":
      return "primary";
    default:
      return "warning";
  }
};

/** Inline status select + optional note dialog, shared by both tabs. */
const StatusEditor = ({ row, statuses, onSave }) => {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(row.status);
  const [note, setNote] = useState(row.note || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(row.status);
    setNote(row.note || "");
  }, [row]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(row._id, { status, note });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Badge type={statusType(row.status)}>{row.status}</Badge>
        <Button size="small" layout="outline" onClick={() => setOpen(true)}>
          Update
        </Button>
      </div>
      <Modal isOpen={open} onClose={() => setOpen(false)}>
        <ModalHeader>Update status</ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <Label>
              <span>Status</span>
              <Select className="mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Label>
            <Label>
              <span>Note</span>
              <Textarea className="mt-1" rows="3" value={note} onChange={(e) => setNote(e.target.value)} />
            </Label>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button layout="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

const SchoolRequestsTab = () => {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminOpsServices.getSchoolRequests({ status, page, limit: PAGE_SIZE });
      setRows(res?.data || []);
      setTotal(res?.total || 0);
    } catch (err) {
      notifyError(errMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (id, body) => {
    try {
      await AdminOpsServices.updateSchoolRequest(id, body);
      notifySuccess("School request updated");
      load();
    } catch (err) {
      notifyError(errMessage(err));
      throw err;
    }
  };

  return (
    <>
      <Card className="mb-5">
        <CardBody>
          <div className="grid gap-4 md:grid-cols-4">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {SCHOOL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>
      {loading ? (
        <TableLoading row={8} col={6} width={160} height={20} />
      ) : (
        <TableContainer className="mb-8">
          <Table>
            <TableHeader>
              <tr>
                <TableCell>Requested</TableCell>
                <TableCell>School</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Parent</TableCell>
                <TableCell>Contact</TableCell>
                <TableCell>Note</TableCell>
                <TableCell className="text-right">Status</TableCell>
              </tr>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <p className="text-center py-6 text-gray-500">No school requests.</p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell>
                      <span className="text-sm whitespace-nowrap">{fmtDateTime(r.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">{r.schoolName}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{r.location}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{r.parentName || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{r.phone || "-"}</div>
                      <div className="text-xs text-gray-500">{r.email || ""}</div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-gray-500">{r.note || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <StatusEditor row={r} statuses={SCHOOL_STATUSES} onSave={save} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TableFooter>
            <Pagination key={status} totalResults={total} resultsPerPage={PAGE_SIZE} onChange={setPage} label="School requests navigation" />
          </TableFooter>
        </TableContainer>
      )}
    </>
  );
};

const EnquiriesTab = () => {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [payloadRow, setPayloadRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminOpsServices.getEnquiries({ kind, status, page, limit: PAGE_SIZE });
      setRows(res?.data || []);
      setTotal(res?.total || 0);
    } catch (err) {
      notifyError(errMessage(err));
    } finally {
      setLoading(false);
    }
  }, [kind, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (id, body) => {
    try {
      await AdminOpsServices.updateEnquiry(id, body);
      notifySuccess("Enquiry updated");
      load();
    } catch (err) {
      notifyError(errMessage(err));
      throw err;
    }
  };

  return (
    <>
      <Card className="mb-5">
        <CardBody>
          <div className="grid gap-4 md:grid-cols-4">
            <Select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All kinds</option>
              {ENQUIRY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {ENQUIRY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>
      {loading ? (
        <TableLoading row={8} col={6} width={160} height={20} />
      ) : (
        <TableContainer className="mb-8">
          <Table>
            <TableHeader>
              <tr>
                <TableCell>Received</TableCell>
                <TableCell>Kind</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Contact</TableCell>
                <TableCell>School</TableCell>
                <TableCell>Message</TableCell>
                <TableCell className="text-right">Status</TableCell>
              </tr>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <p className="text-center py-6 text-gray-500">No enquiries.</p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell>
                      <span className="text-sm whitespace-nowrap">{fmtDateTime(r.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge type="neutral">{r.kind}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">{r.name || "-"}</span>
                      {r.userId && (
                        <div>
                          <Link to={`/customers/${typeof r.userId === "object" ? r.userId._id : r.userId}`} className="text-xs text-emerald-600 hover:underline">
                            open customer
                          </Link>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{r.phone || "-"}</div>
                      <div className="text-xs text-gray-500">{r.email || ""}</div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{r.school || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-gray-600 dark:text-gray-300 max-w-xs whitespace-pre-wrap">{r.message || "-"}</p>
                      {r.note && <p className="text-xs text-gray-400 mt-1">note: {r.note}</p>}
                      {r.payload && Object.keys(r.payload).length > 0 && (
                        <button type="button" className="text-xs text-emerald-600 hover:underline mt-1" onClick={() => setPayloadRow(r)}>
                          view payload
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusEditor row={r} statuses={ENQUIRY_STATUSES} onSave={save} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TableFooter>
            <Pagination key={`${kind}|${status}`} totalResults={total} resultsPerPage={PAGE_SIZE} onChange={setPage} label="Enquiries navigation" />
          </TableFooter>
        </TableContainer>
      )}

      <Modal isOpen={Boolean(payloadRow)} onClose={() => setPayloadRow(null)}>
        <ModalHeader>
          Enquiry payload — {payloadRow?.kind} · {payloadRow?.name}
        </ModalHeader>
        <ModalBody>
          <pre className="text-xs bg-gray-100 dark:bg-gray-900 rounded p-3 overflow-auto max-h-96">{JSON.stringify(payloadRow?.payload || {}, null, 2)}</pre>
        </ModalBody>
        <ModalFooter>
          <Button layout="outline" onClick={() => setPayloadRow(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

const Requests = () => {
  const history = useHistory();
  const location = useLocation();
  const initialTab = new URLSearchParams(location.search).get("tab") === "enquiries" ? "enquiries" : "schools";
  const [tab, setTab] = useState(initialTab);

  const switchTab = (t) => {
    setTab(t);
    history.replace({ pathname: location.pathname, search: `?tab=${t}` });
  };

  return (
    <>
      <PageTitle>Requests & Enquiries</PageTitle>
      <div className="flex gap-2 mb-4">
        {[
          { key: "schools", label: "School requests" },
          { key: "enquiries", label: "Enquiries" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => switchTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
              tab === t.key
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-emerald-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "schools" ? <SchoolRequestsTab /> : <EnquiriesTab />}
    </>
  );
};

export default Requests;

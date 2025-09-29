import React, { useState, useEffect } from "react";
import {
  TextField,
  Button,
  Typography,
  Grid,
  Box,
  Tabs,
  Tab,
  IconButton,
  MenuItem,
} from "@mui/material";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import CloseIcon from "@mui/icons-material/Close";
import stepTwo from "../../../public/profileStepImages/stepTwo.png";
import useRegistration from "@hooks/useRegistration";
import CategoryServices from "@services/CategoryServices";
import useAsync from "@hooks/useAsync";

const nameRegex = /^[A-Za-z]+(?: [A-Za-z]+)*$/;


// Validation schema
const schema = yup.object().shape({
  childFirstName: yup
    .string()
    .matches(nameRegex, "Enter a valid name")
    .required("Child's first name is required"),
  childLastName: yup
    .string()
    .matches(nameRegex, "Enter a valid name")
    .required("Child's last name is required"),
  dob: yup
    .date()
    .nullable()
    .transform((value, originalValue) => {
      // If the value is an empty string, set to null
      return originalValue === "" ? null : value;
    })
    .required("Date of Birth is required"),
  lunchTime: yup.string().required("Lunch time is required"),
  school: yup.string().required("School is required"),
  location: yup.string().required("Location is required"),
  childClass: yup.string().required("Child class is required"),
  section: yup.string().required("Section is required"),
  allergies: yup.string(),
});

const lunchTimeOptions = [
  "11:00 AM - 12:00 PM",
  "12:00 PM - 01:00 PM",
];

const ChildDetailsStep = ({
  formData,
  setFormData,
  nextStep,
  prevStep,
  _id,
  setChildCount,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [children, setChildren] = useState(
    formData.children.length > 0
      ? formData.children
      : [
        {
          childFirstName: "",
          childLastName: "",
          dob: null,
          lunchTime: "",
          school: "",
          location: "",
          childClass: "",
          section: "",
          allergies: "",
        },
      ]
  );
  const { submitHandler, loading } = useRegistration();

  // Fetch schools data
  const { data: schools, loading: schoolsLoading } = useAsync(
    CategoryServices.getAllSchools
  );

  // State for filtered locations
  const [filteredLocations, setFilteredLocations] = useState([]);

  const getYesterdayDateString = () => {
    const now = new Date();
    now.setDate(now.getDate() - 1); // Move one day back
    return now.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  };


  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    control,
    setValue,
    setError,
  } = useForm({
    defaultValues: {
      ...children[activeTab],
      dob: children[activeTab]?.dob
        ? typeof children[activeTab].dob === "string"
          ? children[activeTab].dob.slice(0, 10)
          : ""
        : "",
    },
    resolver: yupResolver(schema),
    mode: "onTouched",
  });

  // Watch school and location changes 
  const watchSchool = watch("school");
  const watchLocation = watch("location");

  // Ensure dropdowns and date field correctly reflect DB data on mount/tab change
  useEffect(() => {
    if (children[activeTab]) {
      const child = {
        ...children[activeTab],
        dob: children[activeTab]?.dob
          ? typeof children[activeTab].dob === "string"
            ? children[activeTab].dob.slice(0, 10)
            : ""
          : "",
      };
      reset(child);
    }
  }, [activeTab, reset]);

  useEffect(() => {
    if (formData.children && formData.children.length > 0) {
      setChildren(formData.children);
      setChildCount(formData.children.length);
    }
  }, [formData.children, setChildCount]);

  // Update filtered locations when school changes
  useEffect(() => {
    if (watchSchool && schools) {
      const schoolLocations = schools
        .filter((school) => school.name === watchSchool)
        .map((school) => school.location);

      const uniqueLocations = [...new Set(schoolLocations)];
      setFilteredLocations(uniqueLocations);

      // Only reset location if non-matching and schools are LOADED
      const currentLocation = watch("location");
      if (
        currentLocation &&
        uniqueLocations.length > 0 &&
        !uniqueLocations.includes(currentLocation)
      ) {
        setValue("location", "");
      } else if (
        currentLocation &&
        uniqueLocations.includes(currentLocation)
      ) {
        // Ensure react-hook-form knows to keep user's value
        setValue("location", currentLocation);
      }
    } else if (watchSchool) {
      // If schools not loaded yet, let location persist (do NOT clear)
      setFilteredLocations([]);
    } else {
      // If school not selected at all, clear location
      setFilteredLocations([]);
      setValue("location", "");
    }
  }, [watchSchool, schools, setValue, watch]);



  // Sync form with children state
  useEffect(() => {
    const subscription = watch((values) => {
      setChildren((prevChildren) => {
        const updated = [...prevChildren];
        updated[activeTab] = { ...updated[activeTab], ...values };
        return updated;
      });
    });
    return () => subscription.unsubscribe();
  }, [watch, activeTab]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const addChild = () => {
    if (children.length < 3) {
    const newChild = {
      childFirstName: "",
      childLastName: "",
      dob: null,
      lunchTime: "",
      school: "",
      location: "",
      childClass: "",
      section: "",
      allergies: "",
    };
    setChildren([...children, newChild]);
    setActiveTab(children.length);
    }
  };

  const removeChild = (index) => {
    if (children.length === 1) return;
    const updatedChildren = children.filter((_, i) => i !== index);
    setChildren(updatedChildren);
    if (index === activeTab && activeTab > 0) {
      setActiveTab(activeTab - 1);
    } else if (index < activeTab) {
      setActiveTab(activeTab - 1);
    }
  };

  const onSubmit = async () => {
    try {
      // Validate all children first
      await Promise.all(
        children.map((child) => schema.validate(child, { abortEarly: false }))
      );

      const res = await submitHandler({
        formData: children,
        step: 2,
        path: "step-Form-ChildDetails",
        _id,
      });

      if (res) {
        setFormData({ ...formData, children });
        setChildCount(children.length);
        nextStep();
      }
    } catch (err) {
      console.log("Validation errors:", err.inner);
      if (err.name === "ValidationError") {
        const invalidIndex = children.findIndex((child) => {
          try {
            schema.validateSync(child, { abortEarly: false });
            return false;
          } catch {
            return true;
          }
        });
        if (invalidIndex >= 0) {
          setActiveTab(invalidIndex);
          if (err.inner && Array.isArray(err.inner)) {
            err.inner.forEach((validationError) => {
              setError(validationError.path, {
                type: "manual",
                message: validationError.message,
              });
            });
          }
        }
      }
    }
  };

  // Generate unique schools list
  const uniqueSchools = schools
    ? [...new Set(schools.map((school) => school.name))]
    : [];

  return (
    <Box
      className="subplnBoxss"
      component="form"
      onSubmit={handleSubmit(onSubmit)}
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        gap: 2,
      }}
    >
      {/* Image Side */}
      <Box
        className="spboximg"
        sx={{
          width: { xs: "100%", md: "45%" },
          backgroundImage: `url(${stepTwo.src})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: "contain",
          backgroundPosition: "center",
          minHeight: 500,
        }}
      />

      {/* Form Side */}
      <Box className="spboxCont" sx={{ width: { xs: "100%", md: "55%" } }}>
        <div className="steptitles">
          <Typography variant="h5">CHILD DETAILS :</Typography>
          {/* Tabs */}
          <Box
            sx={{ display: "flex", alignItems: "center", mb: 2 }}
            className="adchildnav"
          >
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
              className="adchildul"
            >
              {children.map((child, index) => (
                <Tab
                  key={index}
                  label={
                    <Box sx={{ display: "flex", alignItems: "center" }}>
                      <Typography>CHILD {index + 1}</Typography>
                      {children.length > 1 && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeChild(index);
                          }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  }
                  sx={{
                    bgcolor: activeTab === index ? "#FF6A00" : "transparent",
                    color: activeTab === index ? "#fff" : "inherit",
                  }}
                />
              ))} 
            </Tabs>
            {children.length < 3 && (
            <Button
              variant="outlined"
              onClick={addChild}
              className="addanochildbtn"
                disabled={children.length >= 3}
            >
              Add Another Child
            </Button>
            )}
          </Box>
        </div>

        <Grid container className="formboxrow">
          {/* Child First/Last Name */}
          {[
            [
              "CHILD'S FIRST NAME*",
              "childFirstName",
              "Enter Child's First Name",
            ],
            ["CHILD'S LAST NAME*", "childLastName", "Enter Child's Last Name"],
          ].map(([label, name, placeholder]) => (
            <Grid item className="formboxcol" key={name}>
              <Typography
                variant="subtitle2"
                sx={{ color: "#FF6A00", fontWeight: 600, mb: 1 }}
              >
                {label}
              </Typography>
              <TextField
                fullWidth
                placeholder={placeholder}
                {...register(name)}
                error={!!errors[name]}
                helperText={errors[name]?.message}
                sx={{ width: "300px", minWidth: "300px" }}
              />
            </Grid>
          ))}

          {/* Date Picker */}
          <Grid item className="formboxcol" key="dob">
            <Typography
              variant="subtitle2"
              sx={{ color: "#FF6A00", fontWeight: 600, mb: 1 }}
            >
              DATE OF BIRTH*
            </Typography>
            <Controller
              name="dob"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  error={!!errors.dob}
                  helperText={errors.dob?.message}
                  sx={{ width: "300px", minWidth: "300px" }}
                  value={
                    field.value
                      ? typeof field.value === "string"
                        ? field.value.slice(0, 10)
                        : ""
                      : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    field.onChange(val ? val : "");
                  }}
                  inputProps={{ max: getYesterdayDateString() }}
                />
              )}
            />
          </Grid>

          {/* School Dropdown */}
          <Grid item className="formboxcol" key="school">
            <Typography
              variant="subtitle2"
              sx={{ color: "#FF6A00", fontWeight: 600, mb: 1 }}
            >
              SCHOOL*
            </Typography>
            <Controller
              name="school"
              control={control}
              render={({ field }) => (
                <TextField
                  select
                  fullWidth
                  label="Select School"
                  {...field}
                  error={!!errors.school}
                  helperText={errors.school?.message}
                  sx={{ width: "300px", minWidth: "300px" }}
                  disabled={schoolsLoading}
                >
                  <MenuItem value="" disabled>
                    {schoolsLoading ? "Loading schools..." : "Select School"}
                  </MenuItem>
                  {uniqueSchools.map((school) => (
                    <MenuItem key={school} value={school}>
                      {school}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>

          {/* Location Dropdown */}
          <Grid item className="formboxcol" key="location">
            <Typography
              variant="subtitle2"
              sx={{ color: "#FF6A00", fontWeight: 600, mb: 1 }}
            >
              LOCATION*
            </Typography>
            <Controller
              name="location"
              control={control}
              render={({ field }) => (
                <TextField
                  select
                  fullWidth
                  label="Select Location"
                  {...field}
                  error={!!errors.location}
                  helperText={errors.location?.message}
                  sx={{ width: "300px", minWidth: "300px" }}
                  disabled={!watchSchool || filteredLocations.length === 0}
                >
                  <MenuItem value="" disabled>
                    {!watchSchool
                      ? "Select a school first"
                      : filteredLocations.length === 0
                        ? "No locations available"
                        : "Select Location"}
                  </MenuItem>
                  {filteredLocations.map((location) => (
                    <MenuItem key={location} value={location}>
                      {location}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>

          {/* Lunch Time Dropdown (STATIC & mapped with DB values) */}
          <Grid item className="formboxcol" key="lunchTime">
            <Typography
              variant="subtitle2"
              sx={{ color: "#FF6A00", fontWeight: 600, mb: 1 }}
            >
              CHILD'S LUNCH TIME*
            </Typography>
            <Controller
              name="lunchTime"
              control={control}
              render={({ field }) => (
                <TextField
                  select
                  fullWidth
                  label="Select Lunch Time"
                  {...field}
                  error={!!errors.lunchTime}
                  helperText={errors.lunchTime?.message}
                  sx={{ width: "300px", minWidth: "300px" }}
                >
                  <MenuItem value="" disabled>
                    Select Lunch Time
                  </MenuItem>
                  {lunchTimeOptions.map((time) => (
                    <MenuItem key={time} value={time}>
                      {time}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>

          {/* Class Dropdown */}
          <Grid item className="formboxcol" key="childClass">
            <Typography
              variant="subtitle2"
              sx={{ color: "#FF6A00", fontWeight: 600, mb: 1 }}
            >
              CHILD CLASS*
            </Typography>
            <Controller
              name="childClass"
              control={control}
              render={({ field }) => (
                <TextField
                  select
                  fullWidth
                  label="Select Class"
                  {...field}
                  error={!!errors.childClass}
                  helperText={errors.childClass?.message}
                  sx={{ width: "300px", minWidth: "300px" }}
                >
                  <MenuItem value="" disabled>
                    Select Class
                  </MenuItem>
                  {[
                    "LKG",
                    "UKG",
                    "Class 1",
                    "Class 2",
                    "Class 3",
                    "Class 4",
                    "Class 5",
                    "Class 6",
                    "Class 7",
                    "Class 8",
                    "Class 9",
                    "Class 10",
                    "Class 11",
                    "Class 12",
                  ].map((grade) => (
                    <MenuItem key={grade} value={grade}>
                      {grade}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>

          {/* Section Dropdown */}
          <Grid item className="formboxcol" key="section">
            <Typography
              variant="subtitle2"
              sx={{ color: "#FF6A00", fontWeight: 600, mb: 1 }}
            >
              CHILD SECTION*
            </Typography>
            <Controller
              name="section"
              control={control}
              render={({ field }) => (
                <TextField
                  select
                  fullWidth
                  label="Select Section"
                  {...field}
                  error={!!errors.section}
                  helperText={errors.section?.message}
                  sx={{ width: "300px", minWidth: "300px" }}
                >
                  <MenuItem value="" disabled>
                    Select Section
                  </MenuItem>
                  {["A", "B", "C", "D", "E", "F", "G", "H"].map((section) => (
                    <MenuItem key={section} value={section}>
                      {section}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>

          {/* Allergies */}
          <Grid item className="formboxcol">
            <Typography
              variant="subtitle2"
              sx={{ color: "#FF6A00", fontWeight: 600, mb: 1 }}
            >
              DOES THE CHILD HAVE ANY ALLERGIES?
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              placeholder="If yes, please specify."
              {...register("allergies")}
              error={!!errors.allergies}
              helperText={errors.allergies?.message}
              sx={{ width: "625px", minWidth: "625px" }}
            />
          </Grid>
        </Grid>

        <Box className="subbtnrow" sx={{ mt: 4, display: "flex", gap: 3 }}>
          <Button variant="outlined" onClick={prevStep} className="backbtn">
            <span className="nextspan">Back</span>
          </Button>
          <Button
            type="submit"
            variant="contained"
            className="nextbtn"
            disabled={loading}
          >
            {loading ? "Processing..." : <span className="nextspan">Next</span>}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default ChildDetailsStep;

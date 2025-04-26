import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";

type FilterValues = {
  minPrice: number | "";
  maxPrice: number | "";
  category: string;
  sortBy: string,
};

type FilterPanelProps = {
  onFilter: (values: FilterValues) => void;
};

export const FilterPanel = ({ onFilter }: FilterPanelProps) => {
  const initialValues: FilterValues = {
    minPrice: "",
    maxPrice: "",
    category: "",
    sortBy: "",
  };

  const validationSchema = Yup.object({
    minPrice: Yup.number().positive("Must be positive").nullable(),
    maxPrice: Yup.number().positive("Must be positive").nullable(),
    category: Yup.string(),
  });

  const onSubmit = (values: FilterValues) => {
    console.log("Filter values:", values);
    onFilter(values);
  };

  return (
    <div
      style={{
        padding: "1rem",
        border: "1px solid #ccc",
        borderRadius: "8px",
        margin: "1rem 0",
      }}
    >
      <h3>Filter Stocks</h3>
      <Formik
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={onSubmit}
      >
        <Form>
          <div>
            <label>Sort By: </label>
            <Field name="sortBy" as="select">
              <option value="">None</option>
              <option value="priceAsc">Price (Low to High)</option>
              <option value="priceDesc">Price (High to Low)</option>
              <option value="newest">Newest Listed</option>
              <option value="oldest">Oldest Listed</option>
            </Field>
          </div>

          <div>
            <label>Min Price: </label>
            <Field name="minPrice" type="number" />
            <ErrorMessage name="minPrice">
              {(msg) => <div style={{ color: "red" }}>{msg}</div>}
            </ErrorMessage>
          </div>

          <div>
            <label>Max Price: </label>
            <Field name="maxPrice" type="number" />
            <ErrorMessage name="maxPrice">
              {(msg) => <div style={{ color: "red" }}>{msg}</div>}
            </ErrorMessage>
          </div>

          <div>
            <label>Category: </label>
            <Field name="category" as="select">
              <option value="">Select</option>
              <option value="small">Small Cap</option>
              <option value="mid">Mid Cap</option>
              <option value="large">Large Cap</option>
            </Field>
            <ErrorMessage name="category">
              {(msg) => <div style={{ color: "red" }}>{msg}</div>}
            </ErrorMessage>
          </div>

          <button type="submit" style={{ marginTop: "1rem" }}>
            Apply Filter
          </button>
        </Form>
      </Formik>
    </div>
  );
};

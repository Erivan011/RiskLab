// Name this query FactPurchase. Synthetic data, fixed cutoff from the artifact.
let
    Source = Json.Document(Web.Contents("https://risklab-trade-erivan.onrender.com", [RelativePath="purchase-research.json"])),
    Rows = Table.FromRecords(Source[rows]),
    Dates = Table.TransformColumns(Rows, {
        {"orderDate", each Date.From(_), type date},
        {"promisedDate", each Date.From(_), type date},
        {"deliveryDate", each if _ = null then null else Date.From(_), type nullable date},
        {"dueDate", each Date.From(_), type date},
        {"paidDate", each if _ = null then null else Date.From(_), type nullable date}
    }),
    Types = Table.TransformColumnTypes(Dates, {
        {"budgetQty", Int64.Type}, {"actualQty", Int64.Type},
        {"budgetPrice", type number}, {"actualPrice", type number},
        {"budgetFx", type number}, {"actualFx", type number},
        {"budgetBrl", Currency.Type}, {"actualBrl", Currency.Type}
    }),
    Cutoff = Table.AddColumn(Types, "AsOfDate", each Date.From(Source[asOf]), type date),
    IsDelivered = Table.AddColumn(Cutoff, "IsDelivered", each [deliveryDate] <> null and [deliveryDate] <= [AsOfDate], type logical),
    IsOnTime = Table.AddColumn(IsDelivered, "IsOnTime", each [IsDelivered] and [deliveryDate] <= [promisedDate], type logical),
    IsOverdue = Table.AddColumn(IsOnTime, "IsOverduePending", each not [IsDelivered] and [promisedDate] < [AsOfDate], type logical)
in
    IsOverdue

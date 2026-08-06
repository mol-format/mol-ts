Given the following JSON:

```json
{
  "entityType": "customer",
  "id": "customer-alpine-zkOjs35hzw",
  "name": "Alpine Architektur AG",
  "data": {
    "businessId": "business-zkOjs35hzw",
    "type": "business",
    "companyName": "Alpine Architektur AG",
    "email": "info@alpine.example.test",
    "phone": "+41 44 555 31 10",
    "addresses": [
      {
        "id": "customer-alpine-zkOjs35hzw-address",
        "label": "Rechnungsadresse",
        "street": "Limmatquai 84",
        "postalCode": "8001",
        "city": "Zürich",
        "country": "Schweiz"
      }
      {
        "id": "customer-alpine-1938sk29dk-address",
        "label": "Firmenadresse",
        "street": "Silhpost 3",
        "postalCode": "8001",
        "city": "Zürich",
        "country": "Schweiz"
      }
    ],
    "createdAt": "2026-08-06T05:17:12.316Z"
  }
}
```

the resulting markdown looks like:

```
# Alpine Architektur AG

Entity Type: customer
Id: customer-alpine-zkOjs35hzw
Name: Alpine Architektur AG

# Data

Business Id: business-zkOjs35hzw
Type: business
Company Name: Alpine Architektur AG
Email: info@alpine.example.test
Phone: +41 44 555 31 10

## Addresses

### item

Id: customer-alpine-zkOjs35hzw-address
Label: Rechnungsadresse
Street: Limmatquai 84
Postal Code: "8001"
City: Zürich
Country: Schweiz

### item

Id: customer-alpine-1938sk29dk-address
Label: Firmenadresse
Street: Silhpost 3
Postal Code: "8001"
City: Zürich
Country: Schweiz
```

In this case, the ``### item~``` headings are not ideal.

It would be better if one can provide a list of default label identifiers so that instead the generic ``### item`` headings are replaced with the corresponding label from the data. An array of such labels, where the first existing one is used (priority). The check should be case insensitive.

So in this case the labels could be defined as ['label', 'id'], resulting in 

```
# Alpine Architektur AG

Entity Type: customer
Id: customer-alpine-zkOjs35hzw
Name: Alpine Architektur AG

# Data

Business Id: business-zkOjs35hzw
Type: business
Company Name: Alpine Architektur AG
Email: info@alpine.example.test
Phone: +41 44 555 31 10

## Addresses

### Rechnungsadresse

Id: customer-alpine-zkOjs35hzw-address
Label: Rechnungsadresse
Street: Limmatquai 84
Postal Code: "8001"
City: Zürich
Country: Schweiz

### Firmenadresse

Id: customer-alpine-1938sk29dk-address
Label: Firmenadresse
Street: Silhpost 3
Postal Code: "8001"
City: Zürich
Country: Schweiz
```

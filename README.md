# MMM-SnowDay

*MMM-SnowDay* is a module for [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) that displays the percentage chance of getting a snow day tomorrow for a provided postal code.

## Screenshot Loading

![Example of MMM-SnowDay Loading](./exampleloading.png)

## Screenshot Finished

![Example of MMM-SnowDay](./examplefinished.png)

## Installation

### Install

In your terminal, go to the modules directory and clone the repository:

```bash
cd ~/MagicMirror/modules
git clone https://github.com/matthew-burley/MMM-SnowDay/
```

### Update

Go to the module directory and pull the latest changes:

```bash
cd ~/MagicMirror/modules/MMM-SnowDay
git pull
```

## Configuration

To use this module, you have to add a configuration object to the modules array in the `config/config.js` file.

### Example configuration

Minimal configuration to use the module:

```js
    {
        module: 'MMM-SnowDay',
        position: 'top_left',
        config: {
            postalCode: "H3C 5L2",        // postal code to check (Go Habs Go!)
        }
    },
```

Configuration with all options:

```js
    {
        module: 'MMM-SnowDay',
        position: 'lower_third',
        config: {
            postalCode: "H3C 5L2",        // postal code to check (Go Habs Go!)
            city: "Montréal",             // optional manual city name
            updateInterval: 60 * 60 * 1000, // updates every hour
            initialDelay: 15000             // delays on startup to avoid RPi boot congestion
        }
    },
```

### Configuration options

Option|Possible values|Default|Description
------|------|------|-----------
`postalCode`|`H3C 5L2`|"H3C 5L2"|The postal code to check
`city`|`Montréal`|""|The optional manual city name
`updateInterval`|`60 * 60 * 1000`|60 * 60 * 1000|The update interval
`initialDelay`|`15000`|15000|The intial delay on startup to avoid RPi boot congestion

## Developer commands

- `npm install` - Install devDependencies like ESLint.
- `node --run lint` - Run linting and formatter checks.
- `node --run lint:fix` - Fix linting and formatter issues.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.

## Changelog

All notable changes to this project will be documented in the [CHANGELOG.md](CHANGELOG.md) file.
